// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CoftraFixture} from "./utils/CoftraFixture.sol";
import {CoftraVault} from "../src/CoftraVault.sol";
import {ICoftraVault} from "../src/interfaces/ICoftraVault.sol";
import {CoftraDemoNFT} from "../src/test-assets/CoftraDemoNFT.sol";
import {BlockableToken} from "./utils/TestTokens.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Drives random lifecycles through the simulated Reactive pipeline.
contract Handler is Test {
    CoftraInvariantTest internal t;
    CoftraVault internal vault;
    BlockableToken internal blk;
    address internal owner;
    address internal recipient;
    address internal verifier;
    address internal verifier2;
    address internal executor;
    address internal nft;
    address internal registry;

    uint256[] public ids;
    uint256 public calls;

    constructor(CoftraInvariantTest t_, BlockableToken blk_) {
        t = t_;
        vault = t_.vaultRef();
        blk = blk_;
        (owner, recipient, verifier, verifier2, executor, nft, registry) = t_.actors();
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function _pick(uint256 seed) internal view returns (uint256) {
        return ids[seed % ids.length];
    }

    function createProject(uint256 amount, uint256 m0, uint256 m1, uint32 duration, bool useBlk) external {
        amount = bound(amount, 2, 1_000e6);
        m0 = bound(m0, 1, amount - 1);
        m1 = bound(m1, 1, amount - m0);
        uint64 dl = uint64(block.timestamp) + uint64(bound(duration, 3 minutes, 3 days));
        uint256[] memory a = new uint256[](2);
        a[0] = m0;
        a[1] = m1;
        address[] memory v = new address[](2);
        v[0] = verifier;
        v[1] = verifier2;
        address token = useBlk ? address(blk) : address(t.usdcRef());
        vm.startPrank(owner);
        if (useBlk) blk.approve(address(vault), amount);
        else t.usdcRef().approve(address(vault), amount);
        ids.push(vault.createProjectTask(token, amount, recipient, owner, dl, a, v, true));
        vm.stopPrank();
        t.pump();
        calls++;
    }

    function createSession(uint256 amount, uint256 cap, uint32 duration) external {
        if (vault.activeSessionFor(nft, owner) != 0) return;
        amount = bound(amount, 25e6, 500e6);
        cap = bound(cap, 1, amount);
        CoftraVault.SessionParams memory p = CoftraVault.SessionParams({
            executor: executor, target: nft, selector: CoftraDemoNFT.mint.selector, beneficiary: owner, spendCap: cap
        });
        vm.startPrank(owner);
        t.usdcRef().approve(address(vault), amount);
        ids.push(
            vault.createSessionTask(
                address(t.usdcRef()), amount, p, owner, uint64(block.timestamp) + uint64(bound(duration, 3 minutes, 3 days)), true
            )
        );
        vm.stopPrank();
        t.pump();
        calls++;
    }

    function attest(uint256 seed, bool second) external {
        if (ids.length == 0) return;
        uint256 id = _pick(seed);
        uint256 idx = second ? 1 : 0;
        address who = second ? verifier2 : verifier;
        if (!vault.canAttest(id, idx, who, vault.getTask(id).configVersion)) return;
        vm.prank(who);
        (bool ok,) = registry.call(abi.encodeWithSignature("attest(uint256,uint256,uint64)", id, idx, vault.getTask(id).configVersion));
        ok;
        t.pump();
        calls++;
    }

    function execute(uint256 seed) external {
        if (ids.length == 0) return;
        uint256 id = _pick(seed);
        vm.prank(executor);
        try vault.executeSession(id, 25e6, abi.encodeCall(CoftraDemoNFT.mint, (owner))) {} catch {}
        t.pump();
        calls++;
    }

    function warp(uint32 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 6 hours));
        t.cronTick();
        calls++;
    }

    function cancel(uint256 seed) external {
        if (ids.length == 0) return;
        vm.prank(owner);
        try vault.cancel(_pick(seed)) {} catch {}
        t.pump();
    }

    function expireManually(uint256 seed) external {
        if (ids.length == 0) return;
        try vault.expire(_pick(seed)) {} catch {}
        t.pump();
    }

    function toggleBlock(bool b) external {
        blk.setBlocked(recipient, b);
        blk.setBlocked(owner, b);
    }

    function claim(bool fromOwner) external {
        address who = fromOwner ? owner : recipient;
        if (blk.blocked(who)) return;
        vm.prank(who);
        try vault.claim(address(blk)) {} catch {}
    }

    function donate(uint256 amount) external {
        t.usdcRef().mint(address(vault), bound(amount, 0, 1_000e6));
    }
}

contract CoftraInvariantTest is CoftraFixture {
    Handler internal handler;
    BlockableToken internal blk;

    function setUp() public override {
        super.setUp();
        blk = new BlockableToken();
        vm.prank(admin);
        vault.setTokenAllowed(address(blk), true, 0);
        blk.mint(owner, 1e30);
        usdc.mint(owner, 9_000e6); // FAUCET_LIMIT per call
        for (uint256 i; i < 50; ++i) usdc.mint(owner, 10_000e6);
        handler = new Handler(this, blk);
        targetContract(address(handler));
    }

    // exposed for the handler
    function pump() external {
        _pump();
    }

    function cronTick() external {
        _cronTick();
    }

    function vaultRef() external view returns (CoftraVault) {
        return vault;
    }

    function usdcRef() external view returns (CoftraMockUSDCLike) {
        return CoftraMockUSDCLike(address(usdc));
    }

    function actors() external view returns (address, address, address, address, address, address, address) {
        return (owner, recipient, verifier, verifier2, executor, address(nft), address(registry));
    }

    // ---------------------------------------------------------------- invariants

    /// The vault always holds at least what it owes, per token.
    function invariant_solvent() public view {
        assertGe(usdc.balanceOf(address(vault)), vault.totalLiabilities(address(usdc)));
        assertGe(blk.balanceOf(address(vault)), vault.totalLiabilities(address(blk)));
    }

    /// Liabilities equal open task balances plus credits: nothing created or lost in accounting.
    function invariant_liabilitiesMatchTasksAndCredits() public view {
        uint256 sumUsdc;
        uint256 sumBlk;
        uint256 n = handler.idCount();
        for (uint256 i; i < n; ++i) {
            uint256 id = handler.ids(i);
            CoftraVault.Task memory tk = vault.getTask(id);
            uint256 avail = vault.availableBalance(id);
            if (tk.token == address(usdc)) sumUsdc += avail;
            else sumBlk += avail;
        }
        sumBlk += vault.credits(address(blk), owner) + vault.credits(address(blk), recipient);
        sumUsdc += vault.credits(address(usdc), owner) + vault.credits(address(usdc), recipient);
        assertEq(vault.totalLiabilities(address(usdc)), sumUsdc, "usdc liabilities");
        assertEq(vault.totalLiabilities(address(blk)), sumBlk, "blk liabilities");
    }

    /// Per-task conservation, milestone single-settlement, session caps, and terminal-state hygiene.
    function invariant_perTaskRules() public view {
        uint256 n = handler.idCount();
        for (uint256 i; i < n; ++i) {
            uint256 id = handler.ids(i);
            CoftraVault.Task memory tk = vault.getTask(id);
            assertLe(tk.released + tk.refunded, tk.deposited, "never distributes more than deposited");

            bool terminal = tk.state == ICoftraVault.TaskState.Completed || tk.state == ICoftraVault.TaskState.Expired
                || tk.state == ICoftraVault.TaskState.Cancelled;
            if (terminal) {
                assertEq(vault.availableBalance(id), 0, "closed task fully settled");
                assertEq(tk.released + tk.refunded, tk.deposited);
            }
            if (tk.kind == ICoftraVault.TaskKind.ProjectBudget) {
                CoftraVault.Milestone[] memory ms = vault.getMilestones(id);
                uint256 paid;
                uint256 done;
                for (uint256 k; k < ms.length; ++k) {
                    if (ms[k].done) {
                        paid += ms[k].amount;
                        done++;
                    }
                }
                assertEq(tk.released, paid, "released == sum of settled milestones");
                assertEq(tk.milestonesDone, done);
            } else {
                CoftraVault.Session memory s = vault.getSession(id);
                assertLe(s.spent, s.spendCap, "session within cap");
                if (tk.state != ICoftraVault.TaskState.Active) assertFalse(s.executorActive, "no authority after close");
            }
        }
    }

    /// The reactive contract only tracks tasks the vault still considers active.
    function invariant_reactiveTracksOnlyActiveTasks() public view {
        uint256[] memory open = rc.getOpenTasks();
        for (uint256 i; i < open.length; ++i) {
            assertEq(uint8(vault.getTask(open[i]).state), uint8(ICoftraVault.TaskState.Active));
        }
        assertEq(rc.cronSubscribed(), open.length > 0, "cron only while something is open");
    }
}

interface CoftraMockUSDCLike {
    function approve(address, uint256) external returns (bool);
    function mint(address, uint256) external;
}
