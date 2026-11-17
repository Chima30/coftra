// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {ICoftraVault} from "./interfaces/ICoftraVault.sol";

/// @title CoftraVault
/// @notice Holds funds for user tasks, enforces every spending rule locally, and applies lifecycle
///         transitions requested by the Coftra reactive contract on Reactive Network.
/// @dev The vault is the single source of truth. Reactive callbacks are *requests*: each one is
///      re-validated against current state and either applied or recorded with a reason.
///      Callbacks never revert for business reasons, because Reactive Network does not retry.
contract CoftraVault is ICoftraVault, AbstractCallback, ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ constants

    uint256 public constant MAX_MILESTONES = 10;
    uint256 public constant MAX_EXPIRY_BATCH = 5;
    uint64 public constant MIN_DURATION = 2 minutes;
    uint64 public constant MAX_DURATION = 365 days;
    /// @notice After the deadline plus this delay, anyone may run the fallback by hand.
    ///         It exists so funds never depend on Reactive Network being available.
    uint64 public constant MANUAL_RECOVERY_DELAY = 30 minutes;

    // ------------------------------------------------------------------ storage

    struct Task {
        address owner;
        TaskKind kind;
        TaskState state;
        uint8 milestoneCount;
        uint8 milestonesDone;
        uint64 deadline;
        uint64 configVersion;
        uint64 createdAt;
        uint64 closedAt;
        address token;
        address recipient; // project payee (ProjectBudget only)
        address refundTo;
        uint256 deposited;
        uint256 released; // paid to recipient or spent by the session executor
        uint256 refunded; // returned to refundTo at close
    }

    struct Milestone {
        uint256 amount;
        address verifier;
        bool done;
    }

    struct Session {
        address executor;
        address target;
        bytes4 selector;
        address beneficiary;
        uint256 spendCap;
        uint256 spent;
        uint32 executions;
        bool executorActive;
    }

    struct SessionParams {
        address executor;
        address target;
        bytes4 selector;
        address beneficiary;
        uint256 spendCap;
    }

    uint256 public taskCount;
    mapping(uint256 => Task) internal _tasks;
    mapping(uint256 => Milestone[]) internal _milestones;
    mapping(uint256 => Session) internal _sessions;
    mapping(address => uint256[]) internal _tasksByOwner;
    mapping(address => uint256[]) internal _tasksByParty; // recipients, executors, beneficiaries

    /// @notice Active session task per (outcome contract, beneficiary). One at a time keeps the
    ///         outcome-to-task mapping unambiguous.
    mapping(address => mapping(address => uint256)) public activeSessionFor;

    /// @notice Funds that could not be pushed (e.g. recipient rejects transfers). Claimable by `account`.
    mapping(address => mapping(address => uint256)) public credits;

    /// @notice Everything this vault owes, per token: sum of open task balances plus credits.
    ///         The vault's raw token balance can be higher (unsolicited transfers) but never lower.
    mapping(address => uint256) public totalLiabilities;

    mapping(address => bool) public allowedTokens;
    /// @notice Smallest deposit accepted per token. Stops dust tasks from bloating the reactive
    ///         contract's deadline index and keeping cron subscribed for free.
    mapping(address => uint256) public minDeposit;
    bool public creationPaused;

    // ------------------------------------------------------------------ events

    event TaskCreated(
        uint256 indexed taskId, address indexed owner, TaskKind kind, address token, uint256 amount, uint64 deadline
    );
    /// @dev Watched by CoftraReactive to schedule the expiry fallback. Signature is part of the protocol.
    event TaskActivated(uint256 indexed taskId, uint64 deadline);
    /// @dev Watched by CoftraReactive. Signature is part of the protocol.
    event DeadlineExtended(uint256 indexed taskId, uint64 deadline, uint64 configVersion);
    /// @dev Watched by CoftraReactive: acknowledges the task is final so it stops checking it.
    event TaskClosed(uint256 indexed taskId, TaskState finalState);

    event MilestoneReleased(uint256 indexed taskId, uint256 indexed milestoneIndex, address recipient, uint256 amount, bool viaReactive);
    event SessionExecuted(uint256 indexed taskId, address indexed target, uint256 spent, uint32 executions);
    event ExecutorRevoked(uint256 indexed taskId, address indexed executor);
    event Settled(uint256 indexed taskId, TaskState finalState, uint256 released, uint256 refunded, address refundTo);
    event Credited(address indexed token, address indexed account, uint256 amount);
    event Claimed(address indexed token, address indexed account, uint256 amount);
    event ReactiveCallbackHandled(
        uint256 indexed taskId,
        CallbackKind indexed kind,
        uint256 indexed originTxHash,
        uint256 originChainId,
        CallbackResult result
    );
    event TokenAllowed(address indexed token, bool allowed, uint256 minDeposit);
    event CreationPaused(bool paused);

    // ------------------------------------------------------------------ errors

    error TokenNotAllowed();
    error CreationIsPaused();
    error InvalidAmount();
    error InvalidAddress();
    error InvalidDeadline();
    error InvalidMilestones();
    error InvalidSession();
    error NotTaskOwner();
    error NotExecutor();
    error WrongState(TaskState current);
    error DeadlinePassed();
    error RecoveryNotYetAvailable(uint64 availableAt);
    error SessionCallRejected();
    error SessionCallFailed(bytes reason);
    error SpendLimitExceeded();
    error UnsupportedTokenBehaviour();
    error OutcomeAlreadyWatched(uint256 otherTaskId);
    error NothingToClaim();

    constructor(IPayable callbackProxy_, address reactiveContract_, address admin_)
        payable
        AbstractCallback(callbackProxy_, reactiveContract_)
        Ownable(admin_)
    {}

    // ================================================================== admin
    // Admin can only gate *new* activity. It can never touch task balances or credits.

    function setTokenAllowed(address token, bool allowed, uint256 minDeposit_) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        allowedTokens[token] = allowed;
        minDeposit[token] = minDeposit_;
        emit TokenAllowed(token, allowed, minDeposit_);
    }

    function setCreationPaused(bool paused) external onlyOwner {
        creationPaused = paused;
        emit CreationPaused(paused);
    }

    /// @notice Withdraw native coin held to pay callback fees. ERC-20 user funds are not reachable here.
    function withdrawCallbackFunds(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        _pay(to, amount);
    }

    // ================================================================== task creation

    /// @notice CHECKPOINT template: a budget released milestone by milestone to one recipient.
    function createProjectTask(
        address token,
        uint256 amount,
        address recipient,
        address refundTo,
        uint64 deadline,
        uint256[] calldata milestoneAmounts,
        address[] calldata milestoneVerifiers,
        bool activateNow
    ) external nonReentrant returns (uint256 taskId) {
        uint256 n = milestoneAmounts.length;
        if (n == 0 || n > MAX_MILESTONES || n != milestoneVerifiers.length) revert InvalidMilestones();
        if (recipient == address(0) || recipient == address(this)) revert InvalidAddress();

        uint256 sum = 0;
        for (uint256 i; i < n; ++i) {
            if (milestoneAmounts[i] == 0 || milestoneVerifiers[i] == address(0)) revert InvalidMilestones();
            sum += milestoneAmounts[i];
        }
        if (sum > amount) revert InvalidMilestones();

        taskId = _createTask(TaskKind.ProjectBudget, token, amount, refundTo, deadline);
        Task storage t = _tasks[taskId];
        t.recipient = recipient;
        t.milestoneCount = uint8(n);
        for (uint256 i; i < n; ++i) {
            _milestones[taskId].push(Milestone({amount: milestoneAmounts[i], verifier: milestoneVerifiers[i], done: false}));
        }
        _tasksByParty[recipient].push(taskId);

        if (activateNow) _activate(taskId);
    }

    /// @notice CLOSEOUT template: a capped budget an executor may spend on exactly one kind of call.
    /// @dev The permitted call is `target.selector(beneficiary, ...)`. The first argument is pinned so
    ///      whatever the call produces goes to the beneficiary, never to the executor. The beneficiary
    ///      must be the task owner: otherwise anyone could occupy another user's (target, beneficiary)
    ///      slot and block them from opening their own session.
    function createSessionTask(
        address token,
        uint256 amount,
        SessionParams calldata p,
        address refundTo,
        uint64 deadline,
        bool activateNow
    ) external nonReentrant returns (uint256 taskId) {
        if (
            p.executor == address(0) || p.beneficiary != msg.sender || p.executor == msg.sender || p.target.code.length == 0
                || p.target == token || p.target == address(this) || p.target == address(_SERVICE_PROVIDER)
                || p.selector == bytes4(0) || p.spendCap == 0 || p.spendCap > amount
        ) revert InvalidSession();
        // Selectors that could move tokens or permissions on a generic target are never allowed.
        if (
            p.selector == IERC20.approve.selector || p.selector == IERC20.transfer.selector
                || p.selector == IERC20.transferFrom.selector || p.selector == IERC721.setApprovalForAll.selector
        ) revert InvalidSession();

        taskId = _createTask(TaskKind.SpendingSession, token, amount, refundTo, deadline);
        _sessions[taskId] = Session({
            executor: p.executor,
            target: p.target,
            selector: p.selector,
            beneficiary: p.beneficiary,
            spendCap: p.spendCap,
            spent: 0,
            executions: 0,
            executorActive: true
        });
        _tasksByParty[p.executor].push(taskId);

        if (activateNow) _activate(taskId);
    }

    function _createTask(TaskKind kind, address token, uint256 amount, address refundTo, uint64 deadline)
        internal
        returns (uint256 taskId)
    {
        if (creationPaused) revert CreationIsPaused();
        if (!allowedTokens[token]) revert TokenNotAllowed();
        if (amount == 0 || amount < minDeposit[token]) revert InvalidAmount();
        if (refundTo == address(0) || refundTo == address(this)) revert InvalidAddress();
        if (deadline < block.timestamp + MIN_DURATION || deadline > block.timestamp + MAX_DURATION) {
            revert InvalidDeadline();
        }

        // Pull funds and credit only what actually arrived. Fee-on-transfer tokens are rejected.
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        if (IERC20(token).balanceOf(address(this)) - before != amount) revert UnsupportedTokenBehaviour();

        taskId = ++taskCount;
        Task storage t = _tasks[taskId];
        t.owner = msg.sender;
        t.kind = kind;
        t.state = TaskState.Funded;
        t.deadline = deadline;
        t.configVersion = 1;
        t.createdAt = uint64(block.timestamp);
        t.token = token;
        t.refundTo = refundTo;
        t.deposited = amount;

        totalLiabilities[token] += amount;
        _tasksByOwner[msg.sender].push(taskId);

        emit TaskCreated(taskId, msg.sender, kind, token, amount, deadline);
    }

    // ================================================================== owner lifecycle

    function activate(uint256 taskId) external nonReentrant {
        Task storage t = _tasks[taskId];
        if (t.owner != msg.sender) revert NotTaskOwner();
        _activate(taskId);
    }

    function _activate(uint256 taskId) internal {
        Task storage t = _tasks[taskId];
        if (t.state != TaskState.Funded) revert WrongState(t.state);
        if (t.deadline < block.timestamp + MIN_DURATION) revert InvalidDeadline();
        if (t.kind == TaskKind.SpendingSession) {
            Session storage s = _sessions[taskId];
            uint256 other = activeSessionFor[s.target][s.beneficiary];
            if (other != 0) revert OutcomeAlreadyWatched(other);
            activeSessionFor[s.target][s.beneficiary] = taskId;
        }
        t.state = TaskState.Active;
        emit TaskActivated(taskId, t.deadline);
    }

    /// @notice Cancel a task. Funded tasks of any kind can be cancelled. Once active, only spending
    ///         sessions can be cancelled: a project budget is a commitment to the recipient until
    ///         its deadline.
    function cancel(uint256 taskId) external nonReentrant {
        Task storage t = _tasks[taskId];
        if (t.owner != msg.sender) revert NotTaskOwner();
        if (t.state == TaskState.Funded) {
            _close(taskId, TaskState.Cancelled);
        } else if (t.state == TaskState.Active && t.kind == TaskKind.SpendingSession) {
            _close(taskId, TaskState.Cancelled);
        } else {
            revert WrongState(t.state);
        }
    }

    /// @notice Push the deadline out. Bumps the config version so attestations made against the
    ///         old configuration are rejected as stale.
    function extendDeadline(uint256 taskId, uint64 newDeadline) external nonReentrant {
        Task storage t = _tasks[taskId];
        if (t.owner != msg.sender) revert NotTaskOwner();
        if (t.state != TaskState.Active) revert WrongState(t.state);
        if (block.timestamp >= t.deadline) revert DeadlinePassed();
        if (newDeadline <= t.deadline || newDeadline > block.timestamp + MAX_DURATION) revert InvalidDeadline();
        t.deadline = newDeadline;
        t.configVersion += 1;
        emit DeadlineExtended(taskId, newDeadline, t.configVersion);
    }

    /// @notice The owner can always approve their own milestone directly. Recovery path if the
    ///         verifier or the reactive callback is unavailable; the money is the owner's to release.
    function ownerReleaseMilestone(uint256 taskId, uint256 milestoneIndex) external nonReentrant {
        Task storage t = _tasks[taskId];
        if (t.owner != msg.sender) revert NotTaskOwner();
        if (t.state != TaskState.Active) revert WrongState(t.state);
        if (block.timestamp >= t.deadline) revert DeadlinePassed();
        if (milestoneIndex >= t.milestoneCount || _milestones[taskId][milestoneIndex].done) revert InvalidMilestones();
        _releaseMilestone(taskId, milestoneIndex, false);
    }

    /// @notice Manual FALLBACK. Anyone may expire an overdue task once the recovery delay has passed,
    ///         so funds are never stranded if automation is down. Outcome is identical to the
    ///         reactive path: unspent funds go to the task's refund address.
    function expire(uint256 taskId) external nonReentrant {
        Task storage t = _tasks[taskId];
        if (t.state != TaskState.Active) revert WrongState(t.state);
        uint64 availableAt = t.deadline + MANUAL_RECOVERY_DELAY;
        if (block.timestamp < availableAt) revert RecoveryNotYetAvailable(availableAt);
        _close(taskId, TaskState.Expired);
    }

    // ================================================================== spending session

    /// @notice Executor spends from the session budget through the single permitted call.
    /// @dev Limits are enforced here, locally, at call time. A late or missing reactive callback can
    ///      never extend the executor's authority past the cap or the deadline.
    function executeSession(uint256 taskId, uint256 maxSpend, bytes calldata data) external nonReentrant {
        Task storage t = _tasks[taskId];
        Session storage s = _sessions[taskId];
        if (t.kind != TaskKind.SpendingSession || t.state != TaskState.Active) revert WrongState(t.state);
        if (msg.sender != s.executor || !s.executorActive) revert NotExecutor();
        if (block.timestamp >= t.deadline) revert DeadlinePassed();
        if (data.length < 36 || bytes4(data[:4]) != s.selector) revert SessionCallRejected();
        if (abi.decode(data[4:36], (address)) != s.beneficiary) revert SessionCallRejected();
        if (maxSpend == 0 || maxSpend > _available(t) || s.spent + maxSpend > s.spendCap) revert SpendLimitExceeded();

        IERC20 token = IERC20(t.token);
        uint256 before = token.balanceOf(address(this));
        token.forceApprove(s.target, maxSpend);
        // Reviewed (slither reentrancy-balance, SECURITY_REVIEW.md SR-S1): every state-changing entry point
        // is nonReentrant, the target can only pull up to the exact allowance (reset below), and any
        // inbound transfer reverts, so the measured delta cannot be stale or understated.
        // slither-disable-next-line reentrancy-balance,reentrancy-no-eth,low-level-calls
        (bool ok, bytes memory ret) = s.target.call(data);
        token.forceApprove(s.target, 0);
        if (!ok) revert SessionCallFailed(ret);

        uint256 afterBal = token.balanceOf(address(this));
        // The target may only pull, and only up to the allowance. Anything else is rejected outright.
        if (afterBal > before) revert UnsupportedTokenBehaviour();
        uint256 spentNow = before - afterBal;
        if (spentNow > maxSpend) revert SpendLimitExceeded();

        s.spent += spentNow;
        s.executions += 1;
        t.released += spentNow;
        totalLiabilities[t.token] -= spentNow;
        emit SessionExecuted(taskId, s.target, spentNow, s.executions);
    }

    // ================================================================== claims

    function claim(address token) external nonReentrant {
        uint256 amount = credits[token][msg.sender];
        if (amount == 0) revert NothingToClaim();
        credits[token][msg.sender] = 0;
        totalLiabilities[token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Claimed(token, msg.sender, amount);
    }

    // ================================================================== reactive callbacks
    // The first argument is overwritten by Reactive Network with the reactive contract's address.
    // `onlyServiceProvider` pins msg.sender to the callback proxy; `onlyCallbackSender` pins the
    // injected address to our reactive contract. Together they authenticate the request.

    /// @notice CHECKPOINT: a verifier attested a milestone on the origin chain.
    function onMilestoneVerified(
        address rvmId,
        uint256 originChainId,
        uint256 originTxHash,
        uint256 taskId,
        uint256 milestoneIndex,
        address verifier,
        uint64 configVersion
    ) external nonReentrant onlyServiceProvider onlyCallbackSender(rvmId) {
        CallbackResult r = _checkAttestation(taskId, milestoneIndex, verifier, configVersion);
        if (r == CallbackResult.Applied) _releaseMilestone(taskId, milestoneIndex, true);
        emit ReactiveCallbackHandled(taskId, CallbackKind.Milestone, originTxHash, originChainId, r);
    }

    /// @notice CLOSEOUT: an outcome contract minted `tokenId` to `beneficiary`.
    function onOutcome(
        address rvmId,
        uint256 originChainId,
        uint256 originTxHash,
        address emitter,
        address beneficiary,
        uint256 tokenId
    ) external nonReentrant onlyServiceProvider onlyCallbackSender(rvmId) {
        uint256 taskId = activeSessionFor[emitter][beneficiary];
        CallbackResult r;
        if (taskId == 0) {
            r = CallbackResult.NoSessionForOutcome;
        } else {
            Task storage t = _tasks[taskId];
            if (t.state != TaskState.Active) {
                r = CallbackResult.InvalidState;
            } else if (_sessions[taskId].executions == 0) {
                // A mint that the session did not pay for does not complete the session.
                r = CallbackResult.NoExecutionYet;
            } else if (!_ownsToken(emitter, tokenId, beneficiary)) {
                r = CallbackResult.OutcomeUnverified;
            } else {
                r = CallbackResult.Applied;
                _close(taskId, TaskState.Completed);
            }
        }
        emit ReactiveCallbackHandled(taskId, CallbackKind.Outcome, originTxHash, originChainId, r);
    }

    /// @notice FALLBACK: the reactive contract believes these tasks are overdue. Destination time decides.
    function onExpiryCheck(address rvmId, uint256 originChainId, uint256 originTxHash, uint256[] calldata taskIds)
        external
        nonReentrant
        onlyServiceProvider
        onlyCallbackSender(rvmId)
    {
        uint256 n = taskIds.length > MAX_EXPIRY_BATCH ? MAX_EXPIRY_BATCH : taskIds.length;
        for (uint256 i; i < n; ++i) {
            uint256 taskId = taskIds[i];
            Task storage t = _tasks[taskId];
            CallbackResult r;
            if (t.state == TaskState.None) {
                r = CallbackResult.UnknownTask;
            } else if (t.state == TaskState.Funded) {
                r = CallbackResult.InvalidState;
            } else if (t.state != TaskState.Active) {
                // Already final (completed, cancelled, or expired by hand). Re-announce closure so a
                // reactive contract that missed the first TaskClosed stops polling this task.
                r = CallbackResult.AlreadyApplied;
                emit TaskClosed(taskId, t.state);
            } else if (block.timestamp < t.deadline) {
                r = CallbackResult.NotYetDue;
            } else {
                r = CallbackResult.Applied;
                _close(taskId, TaskState.Expired);
            }
            emit ReactiveCallbackHandled(taskId, CallbackKind.Expiry, originTxHash, originChainId, r);
        }
    }

    // ================================================================== internals

    function _checkAttestation(uint256 taskId, uint256 milestoneIndex, address verifier, uint64 configVersion)
        internal
        view
        returns (CallbackResult)
    {
        Task storage t = _tasks[taskId];
        if (t.state == TaskState.None) return CallbackResult.UnknownTask;
        if (t.kind != TaskKind.ProjectBudget || milestoneIndex >= t.milestoneCount) return CallbackResult.InvalidMilestone;
        Milestone storage m = _milestones[taskId][milestoneIndex];
        if (m.done) return CallbackResult.AlreadyApplied;
        if (t.state != TaskState.Active) return CallbackResult.InvalidState;
        if (m.verifier != verifier) return CallbackResult.WrongVerifier;
        if (configVersion != t.configVersion) return CallbackResult.StaleConfig;
        if (block.timestamp >= t.deadline) return CallbackResult.PastDeadline;
        return CallbackResult.Applied;
    }

    function _releaseMilestone(uint256 taskId, uint256 milestoneIndex, bool viaReactive) internal {
        Task storage t = _tasks[taskId];
        Milestone storage m = _milestones[taskId][milestoneIndex];
        m.done = true;
        t.milestonesDone += 1;
        t.released += m.amount;
        _payOrCredit(t.token, t.recipient, m.amount);
        emit MilestoneReleased(taskId, milestoneIndex, t.recipient, m.amount, viaReactive);

        // CLOSEOUT for project budgets: last milestone finalises the task and returns the reserve.
        if (t.milestonesDone == t.milestoneCount) _close(taskId, TaskState.Completed);
    }

    /// @dev Single exit for every terminal transition. Revokes authority, settles the remainder.
    function _close(uint256 taskId, TaskState finalState) internal {
        Task storage t = _tasks[taskId];
        t.state = finalState;
        t.closedAt = uint64(block.timestamp);

        if (t.kind == TaskKind.SpendingSession) {
            Session storage s = _sessions[taskId];
            if (s.executorActive) {
                s.executorActive = false;
                emit ExecutorRevoked(taskId, s.executor);
            }
            if (activeSessionFor[s.target][s.beneficiary] == taskId) delete activeSessionFor[s.target][s.beneficiary];
        }

        uint256 remainder = _available(t);
        if (remainder > 0) {
            t.refunded = remainder;
            _payOrCredit(t.token, t.refundTo, remainder);
        }
        emit Settled(taskId, finalState, t.released, t.refunded, t.refundTo);
        emit TaskClosed(taskId, finalState);
    }

    /// @dev Push the payment; if the token or recipient refuses, keep it claimable instead of
    ///      reverting the whole transition (callbacks are not retried).
    function _payOrCredit(address token, address to, uint256 amount) internal {
        if (IERC20(token).trySafeTransfer(to, amount)) {
            totalLiabilities[token] -= amount;
        } else {
            credits[token][to] += amount;
            emit Credited(token, to, amount);
        }
    }

    function _ownsToken(address nft, uint256 tokenId, address who) internal view returns (bool) {
        try IERC721(nft).ownerOf{gas: 50_000}(tokenId) returns (address o) {
            return o == who;
        } catch {
            return false;
        }
    }

    function _available(Task storage t) internal view returns (uint256) {
        return t.deposited - t.released - t.refunded;
    }

    // ================================================================== views

    function canAttest(uint256 taskId, uint256 milestoneIndex, address verifier, uint64 configVersion)
        external
        view
        returns (bool)
    {
        return _checkAttestation(taskId, milestoneIndex, verifier, configVersion) == CallbackResult.Applied;
    }

    function getTask(uint256 taskId) external view returns (Task memory) {
        return _tasks[taskId];
    }

    function getMilestones(uint256 taskId) external view returns (Milestone[] memory) {
        return _milestones[taskId];
    }

    function getSession(uint256 taskId) external view returns (Session memory) {
        return _sessions[taskId];
    }

    function availableBalance(uint256 taskId) external view returns (uint256) {
        return _available(_tasks[taskId]);
    }

    /// @notice Funds still committed to unfinished milestones (project) or to the remaining spend cap (session).
    function reservedBalance(uint256 taskId) external view returns (uint256 reserved) {
        Task storage t = _tasks[taskId];
        if (t.state != TaskState.Active && t.state != TaskState.Funded) return 0;
        if (t.kind == TaskKind.ProjectBudget) {
            Milestone[] storage ms = _milestones[taskId];
            for (uint256 i; i < ms.length; ++i) {
                if (!ms[i].done) reserved += ms[i].amount;
            }
        } else {
            Session storage s = _sessions[taskId];
            reserved = s.spendCap - s.spent;
        }
    }

    function tasksOf(address owner_) external view returns (uint256[] memory) {
        return _tasksByOwner[owner_];
    }

    function tasksInvolving(address party) external view returns (uint256[] memory) {
        return _tasksByParty[party];
    }
}
