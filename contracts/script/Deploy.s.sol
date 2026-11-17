// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {CoftraVault} from "../src/CoftraVault.sol";
import {CoftraReactive} from "../src/CoftraReactive.sol";
import {CoftraMilestoneVerifier} from "../src/CoftraMilestoneVerifier.sol";
import {CoftraMockUSDC} from "../src/test-assets/CoftraMockUSDC.sol";
import {CoftraDemoNFT} from "../src/test-assets/CoftraDemoNFT.sol";

/// Deployment runs in four steps across two chains. Each step reads earlier addresses from
/// deployments/<network>.json and appends its own. Nothing here holds or prints keys: pass
/// `--account <keystore>` (recommended) or `--private-key` on the command line.
///
///   1. Step1_Assets      Base Sepolia  test token, demo NFT, verifier registry
///   2. Step2_Reactive    Lasna         CoftraReactive (funded with lREACT)
///   3. Step3_Vault       Base Sepolia  CoftraVault (pins the RC address), wiring, callback funding
///   4. Step4_Link        Lasna         rc.setVault(vault) -> subscribes to vault lifecycle events
abstract contract CoftraDeployBase is Script {
    // Verified with Reactive MCP get_network_info (lasna) on 2026-11-17.
    address internal constant BASE_SEPOLIA_CALLBACK_PROXY = 0x476F44b11F5C942c58f4c8E3d0300E5710743585;
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint256 internal constant LASNA_CHAIN_ID = 5318007;
    uint256 internal constant CRON100 = 0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70;
    uint256 internal constant CRON1000 = 0xe20b31294d84c3661ddc8f423abb9c70310d0cf172aa2714ead78029b325e3f4;

    function _file() internal view returns (string memory) {
        return string.concat(vm.projectRoot(), "/deployments/", vm.envOr("DEPLOYMENT_NAME", string("base-sepolia")), ".json");
    }

    function _read(string memory key) internal view returns (address) {
        return vm.parseJsonAddress(vm.readFile(_file()), string.concat(".", key));
    }

    function _write(string memory key, address value) internal {
        string memory path = _file();
        if (!vm.exists(path)) vm.writeFile(path, "{}");
        vm.writeJson(vm.toString(value), path, string.concat(".", key));
    }

    function _writeUint(string memory key, uint256 value) internal {
        vm.writeJson(vm.toString(value), _file(), string.concat(".", key));
    }
}

contract Step1_Assets is CoftraDeployBase {
    function run() external {
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "run on Base Sepolia");
        vm.startBroadcast();
        CoftraMockUSDC usdc = new CoftraMockUSDC();
        CoftraDemoNFT nft = new CoftraDemoNFT(usdc, 25e6, msg.sender);
        CoftraMilestoneVerifier registry = new CoftraMilestoneVerifier();
        vm.stopBroadcast();

        string memory path = _file();
        vm.writeFile(path, "{}");
        _write("token", address(usdc));
        _write("demoNft", address(nft));
        _write("verifierRegistry", address(registry));
        _writeUint("originChainId", block.chainid);
        _writeUint("assetsBlock", block.number);
        console2.log("token", address(usdc));
        console2.log("demoNft", address(nft));
        console2.log("verifierRegistry", address(registry));
    }
}

contract Step2_Reactive is CoftraDeployBase {
    function run() external {
        require(block.chainid == LASNA_CHAIN_ID, "run on Lasna");
        uint256 funding = vm.envOr("RC_FUNDING_WEI", uint256(0)); // lREACT to the RC balance; reserves are funded in Step4
        bool demoCron = vm.envOr("DEMO_FAST_CRON", true);
        uint64 retry = uint64(vm.envOr("RC_RETRY_SECONDS", uint256(300)));

        vm.startBroadcast();
        CoftraReactive rc = new CoftraReactive{value: funding}(
            BASE_SEPOLIA_CHAIN_ID, _read("verifierRegistry"), _read("demoNft"), demoCron ? CRON100 : CRON1000, retry
        );
        vm.stopBroadcast();
        _write("reactive", address(rc));
        _writeUint("reactiveBlock", block.number);
        console2.log("reactive", address(rc));
    }
}

contract Step3_Vault is CoftraDeployBase {
    function run() external {
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "run on Base Sepolia");
        address rc = _read("reactive");
        address admin = vm.envOr("VAULT_ADMIN", msg.sender);
        uint256 callbackFunding = vm.envOr("VAULT_CALLBACK_FUNDING_WEI", uint256(0.002 ether));

        vm.startBroadcast();
        CoftraVault vault = new CoftraVault{value: callbackFunding}(IPayable(payable(BASE_SEPOLIA_CALLBACK_PROXY)), rc, admin);
        CoftraMilestoneVerifier(_read("verifierRegistry")).setVault(vault);
        if (admin == msg.sender) vault.setTokenAllowed(_read("token"), true, 1e6); // 1 tUSDC minimum
        vm.stopBroadcast();

        _write("vault", address(vault));
        _write("callbackProxy", BASE_SEPOLIA_CALLBACK_PROXY);
        _writeUint("vaultBlock", block.number);
        console2.log("vault", address(vault));
    }
}

contract Step4_Link is CoftraDeployBase {
    function run() external {
        require(block.chainid == LASNA_CHAIN_ID, "run on Lasna");
        CoftraReactive rc = CoftraReactive(payable(_read("reactive")));
        // Extra REACT placed in the system contract's reserves for the RC (economy#funding-reactive-contracts),
        // Reaction fees are billed from reserves, not from the RC balance (observed on Lasna). Set RC_RESERVE_WEI=0 to skip.
        uint256 reserve = vm.envOr("RC_RESERVE_WEI", uint256(2 ether));
        vm.startBroadcast();
        rc.setVault(_read("vault"));
        if (reserve > 0) {
            (bool ok,) = payable(0x8888888888888888888888888888888888888888).call{value: reserve}(
                abi.encodeWithSignature("depositTo(address)", address(rc))
            );
            require(ok, "depositTo failed");
        }
        vm.stopBroadcast();
        console2.log("linked vault", rc.vault());
        console2.log("reserve deposited (wei)", reserve);
    }
}

/// Moves REACT sitting in the RC's own balance into its system-contract reserves.
/// Observed on Lasna (2026-11-17): reaction fees were billed from reserves only; the 2 lREACT sent to the
/// payable constructor stayed untouched while reserves drained. Reserves are what keep the RC out of debt.
contract Step5_BalanceToReserves is CoftraDeployBase {
    function run() external {
        require(block.chainid == LASNA_CHAIN_ID, "run on Lasna");
        CoftraReactive rc = CoftraReactive(payable(_read("reactive")));
        uint256 amount = address(rc).balance;
        require(amount > 0, "nothing to move");
        vm.startBroadcast();
        rc.withdraw(payable(msg.sender), amount); // onlyOwner; REACT operating funds only
        (bool ok,) = payable(0x8888888888888888888888888888888888888888).call{value: amount}(
            abi.encodeWithSignature("depositTo(address)", address(rc))
        );
        require(ok, "depositTo failed");
        vm.stopBroadcast();
        console2.log("moved to reserves (wei)", amount);
    }
}
