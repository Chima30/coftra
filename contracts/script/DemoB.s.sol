// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CoftraVault} from "../src/CoftraVault.sol";
import {CoftraMockUSDC} from "../src/test-assets/CoftraMockUSDC.sol";
import {CoftraDemoNFT} from "../src/test-assets/CoftraDemoNFT.sol";

abstract contract DemoBBase is Script {
    function _addr(string memory key) internal view returns (address) {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/deployments/base-sepolia.json"));
        return vm.parseJsonAddress(json, string.concat(".", key));
    }
}

/// Demo B, step 1, signed by the OWNER: open a temporary spending session for BOT_ADDRESS.
/// The bot may spend at most 25 tUSDC, only via CoftraDemoNFT.mint(owner), within 1 day.
contract DemoB1_OpenSession is DemoBBase {
    function run() external {
        address bot = vm.envAddress("BOT_ADDRESS");
        CoftraVault vault = CoftraVault(payable(_addr("vault")));
        CoftraMockUSDC usdc = CoftraMockUSDC(_addr("token"));
        address nft = _addr("demoNft");

        vm.startBroadcast();
        address owner = msg.sender;
        require(bot != owner, "bot must differ from owner");
        usdc.approve(address(vault), 40e6); // exact amount, no unlimited allowance
        uint256 taskId = vault.createSessionTask(
            address(usdc),
            40e6,
            CoftraVault.SessionParams({
                executor: bot,
                target: nft,
                selector: CoftraDemoNFT.mint.selector,
                beneficiary: owner,
                spendCap: 25e6
            }),
            owner,
            uint64(block.timestamp + 1 days),
            true
        );
        vm.stopBroadcast();
        console2.log("Demo B session task", taskId);
    }
}

/// Demo B, step 2, signed by the BOT: the single permitted call. The NFT is minted to the owner.
contract DemoB2_BotMints is DemoBBase {
    function run() external {
        uint256 taskId = vm.envUint("SESSION_TASK_ID");
        CoftraVault vault = CoftraVault(payable(_addr("vault")));
        address owner = vault.getTask(taskId).owner;

        vm.startBroadcast();
        vault.executeSession(taskId, 25e6, abi.encodeCall(CoftraDemoNFT.mint, (owner)));
        vm.stopBroadcast();
        console2.log("bot executed session", taskId);
    }
}
