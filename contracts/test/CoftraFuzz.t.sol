// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CoftraFixture} from "./utils/CoftraFixture.sol";
import {CoftraVault} from "../src/CoftraVault.sol";
import {ICoftraVault} from "../src/interfaces/ICoftraVault.sol";
import {CoftraDemoNFT} from "../src/test-assets/CoftraDemoNFT.sol";

contract CoftraFuzzTest is CoftraFixture {
    /// Any split, any subset of milestones, then expiry: money is conserved exactly.
    function testFuzz_projectConservation(uint256 amount, uint256 m0, uint256 m1, bool pay0, bool pay1) public {
        amount = bound(amount, 2, 10_000e6);
        m0 = bound(m0, 1, amount - 1);
        m1 = bound(m1, 1, amount - m0);
        uint256 id = _project(amount, m0, m1, 1 hours);
        if (pay0) _attest(verifier, id, 0);
        if (pay1) _attest(verifier2, id, 1);
        vm.warp(block.timestamp + 1 hours);
        _cronTick();

        uint256 expectedPaid = (pay0 ? m0 : 0) + (pay1 ? m1 : 0);
        assertEq(usdc.balanceOf(recipient), expectedPaid);
        assertEq(usdc.balanceOf(owner), 10_000e6 - expectedPaid);
        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(vault.totalLiabilities(address(usdc)), 0);
        assertTrue(_state(id) != ICoftraVault.TaskState.Active);
    }

    /// Deadline boundary: one second before is still active, the deadline itself is expired.
    function testFuzz_deadlineBoundary(uint32 duration) public {
        uint64 d = uint64(bound(duration, 3 minutes, 30 days));
        uint256 id = _project(100e6, 30e6, 50e6, d);
        uint64 deadline = vault.getTask(id).deadline;

        vm.warp(deadline - 1);
        assertTrue(vault.canAttest(id, 0, verifier, 1));
        _cronTick();
        assertEq(uint8(_state(id)), uint8(ICoftraVault.TaskState.Active));

        vm.warp(deadline);
        assertFalse(vault.canAttest(id, 0, verifier, 1));
        _cronTick();
        assertEq(uint8(_state(id)), uint8(ICoftraVault.TaskState.Expired));
    }

    /// Executors can never spend past cap or available balance, whatever they ask for.
    function testFuzz_sessionSpendBounded(uint256 amount, uint256 cap, uint256 ask) public {
        amount = bound(amount, 25e6, 1_000e6);
        cap = bound(cap, 1, amount);
        ask = bound(ask, 0, type(uint128).max);
        uint256 id = _session(amount, cap, 1 days);
        vm.prank(executor);
        try vault.executeSession(id, ask, abi.encodeCall(CoftraDemoNFT.mint, (owner))) {
            assertLe(vault.getSession(id).spent, cap);
            assertGe(ask, 25e6);
        } catch {}
        _pump();
        CoftraVault.Task memory t = vault.getTask(id);
        assertLe(t.released, cap);
        assertEq(t.released + t.refunded + vault.availableBalance(id), amount);
    }

    /// Random callback payloads from the authenticated path never move money they should not.
    function testFuzz_randomMilestoneCallbacks(uint256 taskId, uint256 idx, address v, uint64 ver) public {
        uint256 id = _project(100e6, 30e6, 50e6, 1 days);
        bytes memory p = abi.encodeCall(vault.onMilestoneVerified, (address(rc), block.chainid, 1, taskId, idx, v, ver));
        vm.prank(proxy);
        (bool ok,) = address(vault).call(p);
        assertTrue(ok, "never reverts for business reasons");
        bool legit = taskId == id && ((idx == 0 && v == verifier) || (idx == 1 && v == verifier2)) && ver == 1;
        if (!legit) assertEq(usdc.balanceOf(recipient), 0);
    }
}
