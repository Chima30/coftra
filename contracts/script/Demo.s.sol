// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CoftraVault} from "../src/CoftraVault.sol";
import {CoftraMilestoneVerifier} from "../src/CoftraMilestoneVerifier.sol";
import {CoftraMockUSDC} from "../src/test-assets/CoftraMockUSDC.sol";

/// Demo A (CHECKPOINT) and Demo C (FALLBACK) in one broadcast, so the operator signs once.
/// The broadcaster acts as task owner and as verifier. The recipient is a throwaway address
/// derived from a fixed label: nobody holds its key, it only receives test tokens.
contract DemoAC is Script {
    function run() external {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/deployments/base-sepolia.json"));
        CoftraVault vault = CoftraVault(payable(vm.parseJsonAddress(json, ".vault")));
        CoftraMilestoneVerifier registry = CoftraMilestoneVerifier(vm.parseJsonAddress(json, ".verifierRegistry"));
        CoftraMockUSDC usdc = CoftraMockUSDC(vm.parseJsonAddress(json, ".token"));
        address recipient = address(uint160(uint256(keccak256("coftra-demo-recipient"))));

        vm.startBroadcast();
        address me = msg.sender;
        usdc.mint(me, 1_000e6);

        // ---- Demo A: CHECKPOINT. 100 tUSDC, checkpoints 30 + 50, reserve 20, 1-day deadline.
        uint256[] memory amountsA = new uint256[](2);
        amountsA[0] = 30e6;
        amountsA[1] = 50e6;
        address[] memory verifiersA = new address[](2);
        verifiersA[0] = me;
        verifiersA[1] = me;
        usdc.approve(address(vault), 100e6);
        uint256 taskA = vault.createProjectTask(
            address(usdc), 100e6, recipient, me, uint64(block.timestamp + 1 days), amountsA, verifiersA, true
        );
        registry.attest(taskA, 0, 1); // -> Reactive -> onMilestoneVerified -> 30 tUSDC to recipient

        // ---- Demo C: FALLBACK. 20 tUSDC, one 10 tUSDC checkpoint never attested, 5-minute deadline.
        uint256[] memory amountsC = new uint256[](1);
        amountsC[0] = 10e6;
        address[] memory verifiersC = new address[](1);
        verifiersC[0] = me;
        usdc.approve(address(vault), 20e6);
        uint256 taskC = vault.createProjectTask(
            address(usdc), 20e6, recipient, me, uint64(block.timestamp + 5 minutes), amountsC, verifiersC, true
        );
        vm.stopBroadcast();

        console2.log("recipient", recipient);
        console2.log("Demo A task", taskA);
        console2.log("Demo C task", taskC);
    }
}
