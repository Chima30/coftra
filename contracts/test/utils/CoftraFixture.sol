// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, Vm} from "forge-std/Test.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {CoftraVault} from "../../src/CoftraVault.sol";
import {CoftraReactive} from "../../src/CoftraReactive.sol";
import {CoftraMilestoneVerifier} from "../../src/CoftraMilestoneVerifier.sol";
import {ICoftraVault} from "../../src/interfaces/ICoftraVault.sol";
import {CoftraMockUSDC} from "../../src/test-assets/CoftraMockUSDC.sol";
import {CoftraDemoNFT} from "../../src/test-assets/CoftraDemoNFT.sol";
import {MockSystem} from "./MockSystem.sol";

/// @notice Deploys the full Coftra stack and simulates Reactive Network locally:
///         recorded logs -> subscription filter -> react() -> callback queue -> proxy delivery
///         (with the reactive contract's address injected into the first argument).
/// @dev This is a local model of the network, not a substitute for testnet evidence.
abstract contract CoftraFixture is Test {
    address internal constant SYSTEM_ADDR = 0x8888888888888888888888888888888888888888;
    address internal constant CRON = 0x0000000000000000000000000000000000fffFfF;
    uint256 internal constant CRON100 = 0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70;
    uint64 internal constant RETRY = 5 minutes;

    MockSystem internal sys;
    CoftraMockUSDC internal usdc;
    CoftraDemoNFT internal nft;
    CoftraMilestoneVerifier internal registry;
    CoftraReactive internal rc;
    CoftraVault internal vault;

    address internal proxy = makeAddr("callbackProxy");
    address internal admin = makeAddr("admin");
    address internal owner = makeAddr("owner");
    address internal recipient = makeAddr("recipient");
    address internal verifier = makeAddr("verifier");
    address internal verifier2 = makeAddr("verifier2");
    address internal executor = makeAddr("executor");
    address internal treasury = makeAddr("treasury");
    address internal rcDeployer = makeAddr("rcDeployer");

    uint256 internal txCounter;
    uint256 internal deliveries;
    bool internal requireCallbackSuccess = true;

    function setUp() public virtual {
        MockSystem impl = new MockSystem();
        vm.etch(SYSTEM_ADDR, address(impl).code);
        sys = MockSystem(payable(SYSTEM_ADDR));

        usdc = new CoftraMockUSDC();
        nft = new CoftraDemoNFT(usdc, 25e6, treasury);
        registry = new CoftraMilestoneVerifier();

        vm.prank(rcDeployer);
        rc = new CoftraReactive(block.chainid, address(registry), address(nft), CRON100, RETRY);
        vault = new CoftraVault(IPayable(payable(proxy)), address(rc), admin);
        vm.prank(rcDeployer);
        rc.setVault(address(vault));
        registry.setVault(vault);

        vm.prank(admin);
        vault.setTokenAllowed(address(usdc), true, 0);

        usdc.mint(owner, 10_000e6);
        vm.recordLogs();
    }

    // ---------------------------------------------------------------- network simulation

    /// @notice Relay every log recorded since the last pump, then deliver queued callbacks, until quiet.
    function _pump() internal {
        for (uint256 round; round < 10; ++round) {
            Vm.Log[] memory logs = vm.getRecordedLogs();
            for (uint256 i; i < logs.length; ++i) {
                _relay(logs[i]);
            }
            MockSystem.Request[] memory reqs = sys.popAll();
            if (logs.length == 0 && reqs.length == 0) return;
            for (uint256 i; i < reqs.length; ++i) {
                _deliver(reqs[i]);
            }
        }
    }

    function _relay(Vm.Log memory l) internal {
        uint256[4] memory t;
        for (uint256 k; k < l.topics.length && k < 4; ++k) {
            t[k] = uint256(l.topics[k]);
        }
        if (!sys.matches(address(rc), block.chainid, l.emitter, t)) return;
        IReactive.LogRecord memory rec = IReactive.LogRecord({
            chainId: block.chainid,
            contractAddress: l.emitter,
            topic0: t[0],
            topic1: t[1],
            topic2: t[2],
            topic3: t[3],
            data: l.data,
            blockNumber: block.number,
            opCode: l.topics.length,
            blockHash: uint256(blockhash(block.number - 1)),
            txHash: uint256(keccak256(abi.encode("tx", ++txCounter))),
            logIndex: 0
        });
        vm.prank(SYSTEM_ADDR);
        rc.react(rec);
    }

    function _deliver(MockSystem.Request memory req) internal {
        assertEq(req.chainId, block.chainid, "callback chain");
        bytes memory p = req.payload;
        address injected = req.requester; // network injects the requesting RC's address
        assembly {
            mstore(add(p, 36), injected)
        }
        vm.prank(proxy);
        (bool ok,) = req.recipient.call{gas: req.gasLimit}(p);
        deliveries++;
        if (requireCallbackSuccess) assertTrue(ok, "callback reverted");
    }

    /// @notice Emit one cron tick on the simulated Lasna side and process everything it triggers.
    function _cronTick() internal {
        _pump();
        uint256[4] memory t = [CRON100, 0, 0, 0];
        if (sys.matches(address(rc), block.chainid, CRON, t)) {
            IReactive.LogRecord memory rec = IReactive.LogRecord({
                chainId: block.chainid,
                contractAddress: CRON,
                topic0: CRON100,
                topic1: 0,
                topic2: 0,
                topic3: 0,
                data: abi.encode(block.number),
                blockNumber: block.number,
                opCode: 1,
                blockHash: 0,
                txHash: uint256(keccak256(abi.encode("cron", ++txCounter))),
                logIndex: 0
            });
            vm.prank(SYSTEM_ADDR);
            rc.react(rec);
        }
        _pump();
    }

    // ---------------------------------------------------------------- task helpers

    function _project(uint256 amount, uint256 m0, uint256 m1, uint64 duration) internal returns (uint256 id) {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = m0;
        amounts[1] = m1;
        address[] memory vs = new address[](2);
        vs[0] = verifier;
        vs[1] = verifier2;
        vm.startPrank(owner);
        usdc.approve(address(vault), amount);
        id = vault.createProjectTask(
            address(usdc), amount, recipient, owner, uint64(block.timestamp) + duration, amounts, vs, true
        );
        vm.stopPrank();
        _pump();
    }

    function _session(uint256 amount, uint256 cap, uint64 duration) internal returns (uint256 id) {
        CoftraVault.SessionParams memory p = CoftraVault.SessionParams({
            executor: executor,
            target: address(nft),
            selector: CoftraDemoNFT.mint.selector,
            beneficiary: owner,
            spendCap: cap
        });
        vm.startPrank(owner);
        usdc.approve(address(vault), amount);
        id = vault.createSessionTask(address(usdc), amount, p, owner, uint64(block.timestamp) + duration, true);
        vm.stopPrank();
        _pump();
    }

    function _attest(address who, uint256 taskId, uint256 idx) internal {
        uint64 ver = vault.getTask(taskId).configVersion;
        vm.prank(who);
        registry.attest(taskId, idx, ver);
        _pump();
    }

    function _state(uint256 id) internal view returns (ICoftraVault.TaskState) {
        return vault.getTask(id).state;
    }
}
