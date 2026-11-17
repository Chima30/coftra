// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";

/// @title CoftraReactive
/// @notice Runs on Reactive Network (Lasna). Watches narrowly filtered origin events and asks the
///         CoftraVault to apply lifecycle transitions through authenticated callbacks.
/// @dev Holds no user funds and no task rules. It keeps one piece of derived state, the set of open
///      task deadlines, rebuilt purely from the vault's own events (TaskActivated / DeadlineExtended /
///      TaskClosed). The vault re-validates every request, so stale state here can cause a wasted
///      callback but never a wrong transition.
contract CoftraReactive is AbstractReactive {
    // ---------------------------------------------------------------- protocol constants

    /// @dev MilestoneVerified(uint256,uint256,address,uint64) from CoftraMilestoneVerifier.
    uint256 internal constant MILESTONE_VERIFIED_T0 = uint256(keccak256("MilestoneVerified(uint256,uint256,address,uint64)"));
    /// @dev ERC-721 Transfer(address,address,uint256); mints have topic1 == 0.
    uint256 internal constant ERC721_TRANSFER_T0 = uint256(keccak256("Transfer(address,address,uint256)"));
    uint256 internal constant TASK_ACTIVATED_T0 = uint256(keccak256("TaskActivated(uint256,uint64)"));
    uint256 internal constant DEADLINE_EXTENDED_T0 = uint256(keccak256("DeadlineExtended(uint256,uint64,uint64)"));
    uint256 internal constant TASK_CLOSED_T0 = uint256(keccak256("TaskClosed(uint256,uint8)"));

    /// @dev Cron events are emitted on Reactive Network itself by this address.
    address internal constant CRON_EMITTER = 0x0000000000000000000000000000000000fffFfF;

    uint64 public constant MILESTONE_GAS = 400_000;
    uint64 public constant OUTCOME_GAS = 400_000;
    uint64 public constant EXPIRY_GAS = 1_200_000;
    uint256 public constant MAX_EXPIRY_BATCH = 5;
    uint256 public constant MAX_SCAN = 25;

    enum Kind {
        Milestone,
        Outcome,
        Expiry
    }

    // ---------------------------------------------------------------- configuration

    address public immutable owner;
    /// @notice Chain hosting the vault, the verifier registry and the outcome contracts.
    uint256 public immutable destinationChainId;
    address public immutable verifierRegistry;
    /// @notice topic0 of the cron tier used for the fallback (e.g. Cron100 ~ every 100 Lasna blocks).
    uint256 public immutable cronTopic;
    /// @notice Minimum spacing between expiry requests for the same task.
    uint64 public immutable retryInterval;

    address public vault;
    bool public paused;
    mapping(address => bool) public watchedCollections;
    address[] public collectionList;

    // ---------------------------------------------------------------- deadline tracking

    struct Tracked {
        uint64 deadline;
        uint64 lastRequestAt;
        uint32 slot; // index + 1 in openTasks; 0 = not tracked
    }

    mapping(uint256 => Tracked) public tracked;
    uint256[] public openTasks;
    uint256 public scanCursor;
    bool public cronSubscribed;

    // ---------------------------------------------------------------- events (on Lasna)

    /// @notice Lets anyone link an origin transaction to this reactive transaction and its callback.
    event CallbackRequested(Kind indexed kind, uint256 indexed subject, uint256 indexed originTxHash, uint256 originChainId);
    event TaskTracked(uint256 indexed taskId, uint64 deadline);
    event TaskUntracked(uint256 indexed taskId);
    event CronSubscription(bool active);

    error NotOwner();
    error VaultAlreadySet();
    error InvalidAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        uint256 destinationChainId_,
        address verifierRegistry_,
        address initialCollection_,
        uint256 cronTopic_,
        uint64 retryInterval_
    ) payable {
        if (verifierRegistry_ == address(0) || initialCollection_ == address(0)) revert InvalidAddress();
        owner = msg.sender;
        destinationChainId = destinationChainId_;
        verifierRegistry = verifierRegistry_;
        cronTopic = cronTopic_;
        retryInterval = retryInterval_;

        _subRegistry(true);
        watchedCollections[initialCollection_] = true;
        collectionList.push(initialCollection_);
        _subCollection(initialCollection_, true);
    }

    // ================================================================ owner setup

    /// @notice One-time link to the vault (deployed after this contract, since it pins our address).
    function setVault(address vault_) external onlyOwner {
        if (vault != address(0)) revert VaultAlreadySet();
        if (vault_ == address(0)) revert InvalidAddress();
        vault = vault_;
        if (!paused) _subVault(vault_, true);
    }

    function watchCollection(address collection) external onlyOwner {
        if (collection == address(0) || watchedCollections[collection]) revert InvalidAddress();
        watchedCollections[collection] = true;
        collectionList.push(collection);
        if (!paused) _subCollection(collection, true);
    }

    /// @notice Stop reacting (and paying). Tracked deadlines are kept for resume.
    function pause() external onlyOwner {
        if (paused) return;
        paused = true;
        _setAllSubscriptions(false);
    }

    /// @notice Resume. Settles any debt first: a contract in debt receives nothing.
    function resume() external payable onlyOwner {
        if (!paused) return;
        _coverDebt();
        paused = false;
        _setAllSubscriptions(true);
    }

    /// @notice Withdraw REACT operating funds. This contract never holds user assets.
    function withdraw(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        _pay(to, amount);
    }

    // ================================================================ react

    /// @inheritdoc IReactive
    function react(LogRecord calldata log_) external onlySystem {
        // Cron ticks are emitted on Reactive Network itself.
        if (log_.contractAddress == CRON_EMITTER && log_.topic0 == cronTopic) {
            _onCron(log_);
            return;
        }
        if (log_.chainId != destinationChainId) return;

        if (log_.contractAddress == verifierRegistry && log_.topic0 == MILESTONE_VERIFIED_T0 && log_.opCode == 4) {
            _onMilestone(log_);
        } else if (log_.topic0 == ERC721_TRANSFER_T0 && log_.opCode == 4 && log_.topic1 == 0
            && watchedCollections[log_.contractAddress]) {
            _onMint(log_);
        } else if (log_.contractAddress == vault && vault != address(0)) {
            _onVaultEvent(log_);
        }
        // Anything else falls through. Never revert as a filter: reverted reactions are still billed.
    }

    function _onMilestone(LogRecord calldata log_) internal {
        if (vault == address(0)) return;
        uint256 taskId = log_.topic1;
        uint256 milestoneIndex = log_.topic2;
        address verifier = address(uint160(log_.topic3));
        uint64 configVersion = abi.decode(log_.data, (uint64));

        bytes memory payload = abi.encodeWithSignature(
            "onMilestoneVerified(address,uint256,uint256,uint256,uint256,address,uint64)",
            address(0), // replaced by Reactive Network with this contract's address
            log_.chainId,
            log_.txHash,
            taskId,
            milestoneIndex,
            verifier,
            configVersion
        );
        _request(payload, MILESTONE_GAS);
        emit CallbackRequested(Kind.Milestone, taskId, log_.txHash, log_.chainId);
    }

    function _onMint(LogRecord calldata log_) internal {
        if (vault == address(0)) return;
        address beneficiary = address(uint160(log_.topic2));
        uint256 tokenId = log_.topic3;

        bytes memory payload = abi.encodeWithSignature(
            "onOutcome(address,uint256,uint256,address,address,uint256)",
            address(0),
            log_.chainId,
            log_.txHash,
            log_.contractAddress,
            beneficiary,
            tokenId
        );
        _request(payload, OUTCOME_GAS);
        emit CallbackRequested(Kind.Outcome, tokenId, log_.txHash, log_.chainId);
    }

    function _onVaultEvent(LogRecord calldata log_) internal {
        if (log_.topic0 == TASK_ACTIVATED_T0 || log_.topic0 == DEADLINE_EXTENDED_T0) {
            // Both events start with (uint64 deadline, ...) in data.
            uint64 deadline = uint64(abi.decode(log_.data[:32], (uint256)));
            _track(log_.topic1, deadline);
        } else if (log_.topic0 == TASK_CLOSED_T0) {
            _untrack(log_.topic1);
        }
    }

    function _onCron(LogRecord calldata log_) internal {
        uint256 len = openTasks.length;
        if (len == 0 || vault == address(0)) return;

        uint256[] memory due = new uint256[](MAX_EXPIRY_BATCH);
        uint256 count;
        uint256 scans = len < MAX_SCAN ? len : MAX_SCAN;
        uint256 cursor = scanCursor % len;
        for (uint256 i; i < scans && count < MAX_EXPIRY_BATCH; ++i) {
            uint256 taskId = openTasks[cursor];
            Tracked storage tr = tracked[taskId];
            bool retryOk = tr.lastRequestAt == 0 || block.timestamp >= uint256(tr.lastRequestAt) + retryInterval;
            if (tr.deadline <= block.timestamp && retryOk) {
                tr.lastRequestAt = uint64(block.timestamp);
                due[count++] = taskId;
            }
            cursor = (cursor + 1) % len;
        }
        scanCursor = cursor;
        if (count == 0) return;

        assembly ("memory-safe") {
            mstore(due, count)
        }
        bytes memory payload = abi.encodeWithSignature(
            "onExpiryCheck(address,uint256,uint256,uint256[])", address(0), log_.chainId, log_.txHash, due
        );
        _request(payload, EXPIRY_GAS);
        for (uint256 i; i < count; ++i) {
            emit CallbackRequested(Kind.Expiry, due[i], log_.txHash, log_.chainId);
        }
    }

    // ================================================================ tracking helpers

    function _track(uint256 taskId, uint64 deadline) internal {
        Tracked storage tr = tracked[taskId];
        tr.deadline = deadline;
        tr.lastRequestAt = 0;
        if (tr.slot == 0) {
            openTasks.push(taskId);
            tr.slot = uint32(openTasks.length);
            if (!cronSubscribed && !paused) _subCron(true);
        }
        emit TaskTracked(taskId, deadline);
    }

    function _untrack(uint256 taskId) internal {
        Tracked storage tr = tracked[taskId];
        if (tr.slot == 0) return;
        uint256 idx = tr.slot - 1;
        uint256 last = openTasks.length - 1;
        if (idx != last) {
            uint256 moved = openTasks[last];
            openTasks[idx] = moved;
            tracked[moved].slot = uint32(idx + 1);
        }
        openTasks.pop();
        delete tracked[taskId];
        emit TaskUntracked(taskId);
        // Nothing left to watch: stop paying for cron ticks.
        if (openTasks.length == 0 && cronSubscribed) _subCron(false);
    }

    function _request(bytes memory payload, uint64 gasLimit) internal {
        SYSTEM.requestCallbackV_1_0(
            ISystemContract.CallbackConfiguration_V_1_0({
                chainId: destinationChainId,
                recipient: vault,
                gasLimit: gasLimit,
                payload: payload
            })
        );
    }

    // ================================================================ subscriptions
    // subscribe() and unsubscribe() must receive identical arguments, so each pair lives in one helper.

    function _setAllSubscriptions(bool on) internal {
        _subRegistry(on);
        for (uint256 i; i < collectionList.length; ++i) {
            _subCollection(collectionList[i], on);
        }
        if (vault != address(0)) _subVault(vault, on);
        if (on && openTasks.length > 0 && !cronSubscribed) _subCron(true);
        if (!on && cronSubscribed) _subCron(false);
    }

    function _sub(uint256 chainId, address c, uint256 t0, uint256 t1, bool on) internal {
        if (on) SYSTEM.subscribe(chainId, c, t0, t1, REACTIVE_IGNORE, REACTIVE_IGNORE);
        else SYSTEM.unsubscribe(chainId, c, t0, t1, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function _subRegistry(bool on) internal {
        _sub(destinationChainId, verifierRegistry, MILESTONE_VERIFIED_T0, REACTIVE_IGNORE, on);
    }

    function _subCollection(address collection, bool on) internal {
        // topic1 == 0 restricts to mints (from == address(0)); a zero topic is an exact match.
        _sub(destinationChainId, collection, ERC721_TRANSFER_T0, 0, on);
    }

    function _subVault(address vault_, bool on) internal {
        _sub(destinationChainId, vault_, TASK_ACTIVATED_T0, REACTIVE_IGNORE, on);
        _sub(destinationChainId, vault_, DEADLINE_EXTENDED_T0, REACTIVE_IGNORE, on);
        _sub(destinationChainId, vault_, TASK_CLOSED_T0, REACTIVE_IGNORE, on);
    }

    function _subCron(bool on) internal {
        _sub(block.chainid, CRON_EMITTER, cronTopic, REACTIVE_IGNORE, on);
        cronSubscribed = on;
        emit CronSubscription(on);
    }

    // ================================================================ views

    function openTaskCount() external view returns (uint256) {
        return openTasks.length;
    }

    function getOpenTasks() external view returns (uint256[] memory) {
        return openTasks;
    }
}
