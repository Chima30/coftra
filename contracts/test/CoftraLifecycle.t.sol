// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Test.sol";
import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";
import {AbstractPayer} from "@reactive/src/base/AbstractPayer.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {CoftraFixture} from "./utils/CoftraFixture.sol";
import {CoftraVault} from "../src/CoftraVault.sol";
import {CoftraReactive} from "../src/CoftraReactive.sol";
import {CoftraMilestoneVerifier} from "../src/CoftraMilestoneVerifier.sol";
import {ICoftraVault} from "../src/interfaces/ICoftraVault.sol";
import {CoftraDemoNFT} from "../src/test-assets/CoftraDemoNFT.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {FeeToken, BlockableToken} from "./utils/TestTokens.sol";

contract CoftraLifecycleTest is CoftraFixture {
    uint256 internal constant ACTIVATED_T0 = uint256(keccak256("TaskActivated(uint256,uint64)"));

    // ================================================================ CHECKPOINT

    function test_checkpoint_releasesMilestoneThroughReactive() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 days);
        (, uint64 trackedDeadline,) = _trackedOf(id);
        assertEq(trackedDeadline, vault.getTask(id).deadline, "RC tracks deadline from TaskActivated");

        _attest(verifier, id, 0);

        assertEq(usdc.balanceOf(recipient), 30e6, "milestone 1 paid");
        assertEq(vault.availableBalance(id), 70e6);
        assertEq(vault.reservedBalance(id), 50e6);
        assertTrue(vault.getMilestones(id)[0].done);
        assertEq(uint8(_state(id)), uint8(ICoftraVault.TaskState.Active));
    }

    function test_checkpoint_lastMilestoneClosesOutAndRefundsReserve() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 days);
        uint256 ownerBefore = usdc.balanceOf(owner);
        _attest(verifier, id, 0);
        _attest(verifier2, id, 1);

        assertEq(usdc.balanceOf(recipient), 80e6);
        assertEq(usdc.balanceOf(owner) - ownerBefore, 20e6, "reserve returned");
        assertEq(uint8(_state(id)), uint8(ICoftraVault.TaskState.Completed));
        assertEq(vault.availableBalance(id), 0);
        assertEq(vault.totalLiabilities(address(usdc)), 0);
        // RC saw TaskClosed and dropped the task; no open tasks means no paid cron ticks.
        assertEq(rc.openTaskCount(), 0);
        assertFalse(rc.cronSubscribed());
    }

    function test_checkpoint_duplicateEventIsIdempotent() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 days);
        vm.prank(verifier);
        registry.attest(id, 0, 1);
        // Capture the log and replay it twice, as a reorg or duplicate delivery would.
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 r; r < 2; ++r) {
            for (uint256 i; i < logs.length; ++i) {
                _relay(logs[i]);
            }
            _drain();
        }
        assertEq(usdc.balanceOf(recipient), 30e6, "paid exactly once");
    }

    function test_checkpoint_registryRejectsWrongVerifierAndStaleConfig() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 days);
        vm.prank(verifier2);
        vm.expectRevert(CoftraMilestoneVerifier.NotAttestable.selector);
        registry.attest(id, 0, 1);

        vm.prank(owner);
        vault.extendDeadline(id, uint64(block.timestamp + 2 days));
        vm.prank(verifier);
        vm.expectRevert(CoftraMilestoneVerifier.NotAttestable.selector);
        registry.attest(id, 0, 1); // reviewed v1, task is now v2
    }

    function test_checkpoint_vaultRevalidatesEvenIfRegistryIsBypassed() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 days);
        // Wrong verifier forged straight into a callback (e.g. registry on another chain without pre-check).
        _callbackAsNetwork(
            abi.encodeCall(vault.onMilestoneVerified, (address(0), block.chainid, 1, id, 0, verifier2, 1)),
            ICoftraVault.CallbackResult.WrongVerifier
        );
        _callbackAsNetwork(
            abi.encodeCall(vault.onMilestoneVerified, (address(0), block.chainid, 2, id, 0, verifier, 7)),
            ICoftraVault.CallbackResult.StaleConfig
        );
        _callbackAsNetwork(
            abi.encodeCall(vault.onMilestoneVerified, (address(0), block.chainid, 3, id, 9, verifier, 1)),
            ICoftraVault.CallbackResult.InvalidMilestone
        );
        assertEq(usdc.balanceOf(recipient), 0);
    }

    function test_checkpoint_ownerManualReleaseRecoveryPath() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 days);
        vm.prank(owner);
        vault.ownerReleaseMilestone(id, 1);
        assertEq(usdc.balanceOf(recipient), 50e6);
        vm.prank(owner);
        vm.expectRevert(CoftraVault.InvalidMilestones.selector);
        vault.ownerReleaseMilestone(id, 1);
    }

    // ================================================================ callback authentication

    function test_auth_rejectsCallerOtherThanProxy() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 days);
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, address(this), proxy));
        vault.onMilestoneVerified(address(rc), block.chainid, 1, id, 0, verifier, 1);
    }

    function test_auth_rejectsOtherReactiveContract() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 days);
        address impostor = makeAddr("otherRC");
        vm.prank(proxy);
        vm.expectRevert(abi.encodeWithSelector(AbstractCallback.CallbackNotAuthorized.selector, impostor, address(rc)));
        vault.onMilestoneVerified(impostor, block.chainid, 1, id, 0, verifier, 1);
    }

    function test_auth_reactOnlyFromSystem() public {
        IReactive.LogRecord memory rec;
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, address(this), SYSTEM_ADDR));
        rc.react(rec);
    }

    function test_auth_forgedEventFromOtherEmitterIsIgnored() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 days);
        FakeRegistry fake = new FakeRegistry();
        vm.prank(verifier);
        fake.attest(id, 0, 1); // same event signature, wrong contract
        _pump();
        assertEq(sys.totalRequests(), 0, "no callback requested");
        assertEq(usdc.balanceOf(recipient), 0);
    }

    function test_auth_setVaultOnlyOnceAndOnlyOwner() public {
        vm.expectRevert(CoftraReactive.NotOwner.selector);
        rc.setVault(address(1));
        vm.prank(rcDeployer);
        vm.expectRevert(CoftraReactive.VaultAlreadySet.selector);
        rc.setVault(address(1));
    }

    // ================================================================ CLOSEOUT (spending session)

    function test_closeout_mintClosesSessionRevokesExecutorAndRefunds() public {
        uint256 id = _session(100e6, 60e6, 1 days);
        uint256 ownerBefore = usdc.balanceOf(owner);

        vm.prank(executor);
        vault.executeSession(id, 25e6, abi.encodeCall(CoftraDemoNFT.mint, (owner)));
        _pump(); // Transfer(0, owner, 1) -> RC -> onOutcome

        assertEq(nft.ownerOf(1), owner, "owner holds the NFT");
        assertEq(uint8(_state(id)), uint8(ICoftraVault.TaskState.Completed));
        assertFalse(vault.getSession(id).executorActive);
        assertEq(usdc.balanceOf(owner) - ownerBefore, 75e6, "unspent refunded");
        assertEq(usdc.allowance(address(vault), address(nft)), 0, "no lingering approval");

        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(CoftraVault.WrongState.selector, ICoftraVault.TaskState.Completed));
        vault.executeSession(id, 25e6, abi.encodeCall(CoftraDemoNFT.mint, (owner)));
    }

    function test_closeout_mintNotPaidBySessionDoesNotClose() public {
        uint256 id = _session(100e6, 60e6, 1 days);
        // Someone else mints to the owner directly; the session did nothing yet.
        address stranger = makeAddr("stranger");
        usdc.mint(stranger, 25e6);
        vm.startPrank(stranger);
        usdc.approve(address(nft), 25e6);
        nft.mint(owner);
        vm.stopPrank();
        _pump();
        assertEq(uint8(_state(id)), uint8(ICoftraVault.TaskState.Active));
        assertTrue(vault.getSession(id).executorActive);
    }

    function test_session_localLimitsEnforced() public {
        uint256 id = _session(100e6, 30e6, 1 days);
        bytes memory good = abi.encodeCall(CoftraDemoNFT.mint, (owner));

        vm.expectRevert(CoftraVault.NotExecutor.selector);
        vault.executeSession(id, 25e6, good);

        vm.startPrank(executor);
        vm.expectRevert(CoftraVault.SessionCallRejected.selector);
        vault.executeSession(id, 25e6, abi.encodeCall(CoftraDemoNFT.mint, (executor))); // NFT to executor

        vm.expectRevert(CoftraVault.SessionCallRejected.selector);
        vault.executeSession(id, 25e6, abi.encodeWithSignature("burn(address)", owner));

        vm.expectRevert(CoftraVault.SpendLimitExceeded.selector);
        vault.executeSession(id, 31e6, good);

        vm.expectRevert(); // allowance below price: NFT pull fails
        vault.executeSession(id, 10e6, good);
        vm.stopPrank();

        vm.warp(vault.getTask(id).deadline);
        vm.prank(executor);
        vm.expectRevert(CoftraVault.DeadlinePassed.selector);
        vault.executeSession(id, 25e6, good);
    }

    function test_session_delayedCallbackCannotExceedCap() public {
        // Disable automatic relays to model a closeout callback that has not arrived yet.
        uint256 id = _session(100e6, 50e6, 1 days);
        bytes memory good = abi.encodeCall(CoftraDemoNFT.mint, (owner));
        vm.startPrank(executor);
        vault.executeSession(id, 25e6, good);
        vault.executeSession(id, 25e6, good);
        vm.expectRevert(CoftraVault.SpendLimitExceeded.selector);
        vault.executeSession(id, 25e6, good);
        vm.stopPrank();
        assertEq(vault.getSession(id).spent, 50e6);
    }

    function test_session_rejectsDangerousConfig() public {
        CoftraVault.SessionParams memory p = CoftraVault.SessionParams({
            executor: executor, target: address(usdc), selector: bytes4(0x12345678), beneficiary: owner, spendCap: 1e6
        });
        vm.startPrank(owner);
        usdc.approve(address(vault), 10e6);
        vm.expectRevert(CoftraVault.InvalidSession.selector);
        vault.createSessionTask(address(usdc), 10e6, p, owner, uint64(block.timestamp + 1 days), true);

        p.target = address(nft);
        p.selector = bytes4(keccak256("setApprovalForAll(address,bool)"));
        vm.expectRevert(CoftraVault.InvalidSession.selector);
        vault.createSessionTask(address(usdc), 10e6, p, owner, uint64(block.timestamp + 1 days), true);

        p.selector = CoftraDemoNFT.mint.selector;
        p.spendCap = 11e6;
        vm.expectRevert(CoftraVault.InvalidSession.selector);
        vault.createSessionTask(address(usdc), 10e6, p, owner, uint64(block.timestamp + 1 days), true);
        vm.stopPrank();
    }

    function test_session_onlyOneActiveSessionPerOutcome() public {
        uint256 first = _session(100e6, 50e6, 1 days);
        CoftraVault.SessionParams memory p = CoftraVault.SessionParams({
            executor: executor, target: address(nft), selector: CoftraDemoNFT.mint.selector, beneficiary: owner, spendCap: 10e6
        });
        vm.startPrank(owner);
        usdc.approve(address(vault), 10e6);
        vm.expectRevert(abi.encodeWithSelector(CoftraVault.OutcomeAlreadyWatched.selector, first));
        vault.createSessionTask(address(usdc), 10e6, p, owner, uint64(block.timestamp + 1 days), true);
        vm.stopPrank();
    }

    function test_session_ownerCanCancelActiveSession() public {
        uint256 id = _session(100e6, 50e6, 1 days);
        uint256 before = usdc.balanceOf(owner);
        vm.prank(owner);
        vault.cancel(id);
        _pump();
        assertEq(usdc.balanceOf(owner) - before, 100e6);
        assertEq(vault.activeSessionFor(address(nft), owner), 0);
        assertEq(rc.openTaskCount(), 0);
    }

    // ================================================================ FALLBACK

    function test_fallback_cronExpiresOverdueTaskAndPreservesPaidMilestones() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 hours);
        _attest(verifier, id, 0);
        assertTrue(rc.cronSubscribed());

        _cronTick(); // not due yet: no request
        assertEq(sys.totalRequests(), 1, "only the milestone callback so far");

        uint256 ownerBefore = usdc.balanceOf(owner);
        vm.warp(block.timestamp + 1 hours);
        _cronTick();

        assertEq(uint8(_state(id)), uint8(ICoftraVault.TaskState.Expired));
        assertEq(usdc.balanceOf(recipient), 30e6, "completed payout preserved");
        assertEq(usdc.balanceOf(owner) - ownerBefore, 70e6, "unspent returned");
        assertEq(rc.openTaskCount(), 0, "RC stopped tracking after TaskClosed ack");
        assertFalse(rc.cronSubscribed(), "cron unsubscribed when idle");

        // Late completion is rejected at the registry and, if forced, at the vault.
        vm.prank(verifier2);
        vm.expectRevert(CoftraMilestoneVerifier.NotAttestable.selector);
        registry.attest(id, 1, 1);
        _callbackAsNetwork(
            abi.encodeCall(vault.onMilestoneVerified, (address(0), block.chainid, 9, id, 1, verifier2, 1)),
            ICoftraVault.CallbackResult.InvalidState
        );
    }

    function test_fallback_retriesAfterIntervalUntilVaultAcks() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 hours);
        vm.warp(block.timestamp + 1 hours);
        // Drop the first expiry callback (models a failed or unfunded delivery).
        _cronTickDropping();
        assertEq(uint8(_state(id)), uint8(ICoftraVault.TaskState.Active));
        uint256 reqs = sys.totalRequests();

        _cronTick(); // within retry interval: RC holds off
        assertEq(sys.totalRequests(), reqs, "respects retry interval");

        vm.warp(block.timestamp + RETRY);
        _cronTick();
        assertEq(uint8(_state(id)), uint8(ICoftraVault.TaskState.Expired), "retry delivered");
    }

    function test_fallback_vaultIgnoresEarlyExpiryRequest() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 hours);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        _callbackAsNetwork(
            abi.encodeCall(vault.onExpiryCheck, (address(0), block.chainid, 1, ids)),
            ICoftraVault.CallbackResult.NotYetDue
        );
        assertEq(uint8(_state(id)), uint8(ICoftraVault.TaskState.Active));
    }

    function test_fallback_completionAndExpiryRaceResolvesOnce() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 hours);
        vm.prank(verifier);
        registry.attest(id, 0, 1);
        vm.prank(verifier2);
        registry.attest(id, 1, 1);
        vm.warp(block.timestamp + 1 hours); // callbacks land after the deadline
        _pump();
        assertEq(usdc.balanceOf(recipient), 0, "destination time is authoritative");
        _cronTick();
        assertEq(uint8(_state(id)), uint8(ICoftraVault.TaskState.Expired));
        assertEq(usdc.balanceOf(owner), 10_000e6, "full refund, nothing double counted");
    }

    function test_fallback_manualRecoveryWhenAutomationIsDown() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 hours);
        vm.warp(block.timestamp + 1 hours);
        vm.expectRevert();
        vault.expire(id);
        vm.warp(block.timestamp + vault.MANUAL_RECOVERY_DELAY());
        vm.prank(makeAddr("anyone"));
        vault.expire(id);
        assertEq(usdc.balanceOf(owner), 10_000e6);
        vm.expectRevert(abi.encodeWithSelector(CoftraVault.WrongState.selector, ICoftraVault.TaskState.Expired));
        vault.expire(id);
    }

    function test_fallback_expiryOfAlreadyClosedTaskReAcks() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 hours);
        vm.warp(block.timestamp + 2 hours);
        vault.expire(id);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        _callbackAsNetwork(
            abi.encodeCall(vault.onExpiryCheck, (address(0), block.chainid, 1, ids)),
            ICoftraVault.CallbackResult.AlreadyApplied
        );
    }

    // ================================================================ accounting & safety

    function test_creation_validation() public {
        uint256[] memory a = new uint256[](1);
        address[] memory v = new address[](1);
        a[0] = 50e6;
        v[0] = verifier;
        uint64 dl = uint64(block.timestamp + 1 days);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vm.expectRevert(CoftraVault.InvalidMilestones.selector);
        vault.createProjectTask(address(usdc), 40e6, recipient, owner, dl, a, v, true); // sum > amount
        vm.expectRevert(CoftraVault.InvalidAddress.selector);
        vault.createProjectTask(address(usdc), 50e6, address(0), owner, dl, a, v, true);
        vm.expectRevert(CoftraVault.InvalidDeadline.selector);
        vault.createProjectTask(address(usdc), 50e6, recipient, owner, uint64(block.timestamp + 10), a, v, true);
        vm.expectRevert(CoftraVault.TokenNotAllowed.selector);
        vault.createProjectTask(address(0xBEEF), 50e6, recipient, owner, dl, a, v, true);
        vm.expectRevert(CoftraVault.InvalidMilestones.selector);
        vault.createProjectTask(address(usdc), 0, recipient, owner, dl, new uint256[](0), new address[](0), true);
        uint256[] memory many = new uint256[](11);
        address[] memory manyV = new address[](11);
        vm.expectRevert(CoftraVault.InvalidMilestones.selector);
        vault.createProjectTask(address(usdc), 100e6, recipient, owner, dl, many, manyV, true);
        vm.stopPrank();
    }

    function test_feeOnTransferTokenRejected() public {
        FeeToken fee = new FeeToken();
        vm.prank(admin);
        vault.setTokenAllowed(address(fee), true, 0);
        fee.mint(owner, 100e6);
        uint256[] memory a = new uint256[](1);
        address[] memory v = new address[](1);
        a[0] = 10e6;
        v[0] = verifier;
        vm.startPrank(owner);
        fee.approve(address(vault), 100e6);
        vm.expectRevert(CoftraVault.UnsupportedTokenBehaviour.selector);
        vault.createProjectTask(address(fee), 100e6, recipient, owner, uint64(block.timestamp + 1 days), a, v, true);
        vm.stopPrank();
    }

    function test_failedPayoutIsCreditedAndClaimableOnce() public {
        BlockableToken blk = new BlockableToken();
        vm.prank(admin);
        vault.setTokenAllowed(address(blk), true, 0);
        blk.mint(owner, 100e6);
        uint256[] memory a = new uint256[](1);
        address[] memory v = new address[](1);
        a[0] = 40e6;
        v[0] = verifier;
        vm.startPrank(owner);
        blk.approve(address(vault), 100e6);
        uint256 id =
            vault.createProjectTask(address(blk), 100e6, recipient, owner, uint64(block.timestamp + 1 days), a, v, true);
        vm.stopPrank();
        _pump();

        blk.setBlocked(recipient, true);
        _attest(verifier, id, 0); // callback must not revert even though transfer fails
        assertEq(vault.credits(address(blk), recipient), 40e6);
        assertEq(uint8(_state(id)), uint8(ICoftraVault.TaskState.Completed));

        blk.setBlocked(recipient, false);
        vm.prank(recipient);
        vault.claim(address(blk));
        assertEq(blk.balanceOf(recipient), 40e6);
        vm.prank(recipient);
        vm.expectRevert(CoftraVault.NothingToClaim.selector);
        vault.claim(address(blk));
        assertEq(vault.totalLiabilities(address(blk)), 0);
    }

    function test_crossTaskIsolation() public {
        uint256 a = _project(100e6, 30e6, 50e6, 1 days);
        uint256 s = _session(200e6, 100e6, 1 days);
        vm.startPrank(executor);
        vault.executeSession(s, 25e6, abi.encodeCall(CoftraDemoNFT.mint, (owner)));
        vm.stopPrank();
        _pump();
        assertEq(vault.availableBalance(a), 100e6, "project untouched by session spend");
        assertEq(vault.totalLiabilities(address(usdc)), 100e6);
    }

    function test_unsolicitedTransferDoesNotChangeCredits() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 days);
        usdc.mint(address(vault), 999e6);
        assertEq(vault.availableBalance(id), 100e6);
        assertEq(vault.totalLiabilities(address(usdc)), 100e6);
    }

    function test_projectCannotBeCancelledOnceActive_butCanWhileFunded() public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 days);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CoftraVault.WrongState.selector, ICoftraVault.TaskState.Active));
        vault.cancel(id);

        uint256[] memory am = new uint256[](1);
        address[] memory vs = new address[](1);
        am[0] = 10e6;
        vs[0] = verifier;
        vm.startPrank(owner);
        usdc.approve(address(vault), 10e6);
        uint256 f =
            vault.createProjectTask(address(usdc), 10e6, recipient, owner, uint64(block.timestamp + 1 days), am, vs, false);
        vault.cancel(f);
        vm.expectRevert(abi.encodeWithSelector(CoftraVault.WrongState.selector, ICoftraVault.TaskState.Cancelled));
        vault.activate(f);
        vm.stopPrank();
    }

    // ================================================================ security review regressions

    /// SR-1: nobody can open a session naming someone else as beneficiary (slot griefing).
    function test_sr1_sessionBeneficiaryMustBeOwner() public {
        address attacker = makeAddr("attacker");
        usdc.mint(attacker, 100e6);
        CoftraVault.SessionParams memory p = CoftraVault.SessionParams({
            executor: executor, target: address(nft), selector: CoftraDemoNFT.mint.selector, beneficiary: owner, spendCap: 10e6
        });
        vm.startPrank(attacker);
        usdc.approve(address(vault), 10e6);
        vm.expectRevert(CoftraVault.InvalidSession.selector);
        vault.createSessionTask(address(usdc), 10e6, p, attacker, uint64(block.timestamp + 1 days), true);
        vm.stopPrank();
        // and the real owner can still open theirs
        _session(100e6, 50e6, 1 days);

        // the owner cannot be their own executor either
        p.executor = owner;
        vm.startPrank(owner);
        usdc.approve(address(vault), 10e6);
        vm.expectRevert(CoftraVault.InvalidSession.selector);
        vault.createSessionTask(address(usdc), 10e6, p, owner, uint64(block.timestamp + 1 days), false);
        vm.stopPrank();
    }

    /// SR-2: repeated attestations of the same milestone are rate limited.
    function test_sr2_attestationCooldown() public {
        uint256[] memory a = new uint256[](1);
        address[] memory v = new address[](1);
        a[0] = 10e6;
        v[0] = verifier;
        // Owner-only vault check would block a second attestation after release, so model the
        // "callback lost" case: attest, drop the delivery, attest again.
        vm.startPrank(owner);
        usdc.approve(address(vault), 10e6);
        uint256 id = vault.createProjectTask(address(usdc), 10e6, recipient, owner, uint64(block.timestamp + 1 days), a, v, true);
        vm.stopPrank();
        _pump();
        vm.prank(verifier);
        registry.attest(id, 0, 1);
        vm.getRecordedLogs(); // lost
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(CoftraMilestoneVerifier.AttestationCooldown.selector, block.timestamp + 5 minutes));
        registry.attest(id, 0, 1);
        vm.warp(block.timestamp + 5 minutes);
        _attest(verifier, id, 0);
        assertEq(usdc.balanceOf(recipient), 10e6, "retry after cooldown delivered");
    }

    /// SR-3: admin-set minimum deposit blocks dust tasks.
    function test_sr3_minimumDeposit() public {
        vm.prank(admin);
        vault.setTokenAllowed(address(usdc), true, 1e6);
        uint256[] memory a = new uint256[](1);
        address[] memory v = new address[](1);
        a[0] = 1;
        v[0] = verifier;
        vm.startPrank(owner);
        usdc.approve(address(vault), 1e6);
        vm.expectRevert(CoftraVault.InvalidAmount.selector);
        vault.createProjectTask(address(usdc), 1e6 - 1, recipient, owner, uint64(block.timestamp + 1 days), a, v, true);
        vault.createProjectTask(address(usdc), 1e6, recipient, owner, uint64(block.timestamp + 1 days), a, v, true);
        vm.stopPrank();
    }

    function test_adminCannotTouchUserFunds() public {
        _project(100e6, 30e6, 50e6, 1 days);
        vm.deal(address(vault), 1 ether);
        vm.prank(admin);
        vault.withdrawCallbackFunds(payable(admin), 1 ether); // native gas funds only
        assertEq(usdc.balanceOf(address(vault)), 100e6);
        vm.prank(admin);
        vault.setCreationPaused(true);
        uint256[] memory am = new uint256[](1);
        address[] memory vs = new address[](1);
        am[0] = 1;
        vs[0] = verifier;
        vm.prank(owner);
        vm.expectRevert(CoftraVault.CreationIsPaused.selector);
        vault.createProjectTask(address(usdc), 1, recipient, owner, 0, am, vs, false);
    }

    function test_rcPauseAndResumeToggleSubscriptions() public {
        _project(100e6, 30e6, 50e6, 1 days);
        uint256 active = sys.activeSubscriptionCount(address(rc));
        assertEq(active, 6, "registry + collection + 3 vault events + cron");
        vm.prank(rcDeployer);
        rc.pause();
        assertEq(sys.activeSubscriptionCount(address(rc)), 0);
        vm.prank(rcDeployer);
        rc.resume();
        assertEq(sys.activeSubscriptionCount(address(rc)), 6);
    }

    // ================================================================ helpers

    function _trackedOf(uint256 id) internal view returns (uint64, uint64, uint32) {
        (uint64 d, uint64 l, uint32 s) = rc.tracked(id);
        return (l, d, s);
    }

    function _drain() internal {
        _pump();
    }

    /// @dev Deliver a hand-built payload as if the network sent it, and assert the recorded result.
    function _callbackAsNetwork(bytes memory payload, ICoftraVault.CallbackResult expected) internal {
        assembly {
            mstore(add(payload, 36), sload(rc.slot))
        }
        vm.recordLogs();
        vm.prank(proxy);
        (bool ok,) = address(vault).call(payload);
        assertTrue(ok, "callback must not revert");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 t0 = keccak256("ReactiveCallbackHandled(uint256,uint8,uint256,uint256,uint8)");
        bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(vault) && logs[i].topics[0] == t0) {
                (, uint8 result) = abi.decode(logs[i].data, (uint256, uint8));
                assertEq(result, uint8(expected), "callback result");
                found = true;
            }
        }
        assertTrue(found, "result event emitted");
        _pump();
    }

    function _cronTickDropping() internal {
        _pump();
        IReactive.LogRecord memory rec;
        rec.chainId = block.chainid;
        rec.contractAddress = CRON;
        rec.topic0 = CRON100;
        rec.opCode = 1;
        rec.data = abi.encode(block.number);
        vm.prank(SYSTEM_ADDR);
        rc.react(rec);
        sys.popAll(); // lost delivery
        vm.getRecordedLogs();
    }
}

/// @dev Emits the same event signature as the real registry from an unauthorised address.
contract FakeRegistry {
    event MilestoneVerified(
        uint256 indexed taskId, uint256 indexed milestoneIndex, address indexed verifier, uint64 configVersion
    );

    function attest(uint256 t, uint256 m, uint64 v) external {
        emit MilestoneVerified(t, m, msg.sender, v);
    }
}
