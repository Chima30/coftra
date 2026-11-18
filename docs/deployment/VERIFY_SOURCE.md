# Source verification

**Status: not yet submitted.** Verification publishes the source to Sourcify and needs the project owner's approval.

## Pre-check: does the source match what is deployed?

Checked 2026-11-18. The runtime bytecode of each deployed contract was compared with `forge build` output from the current `contracts/src`. Only the compiler-reported immutable slots (values set in the constructor) were masked; every other byte, including the trailing metadata hash, had to be identical.

| Contract | Chain | Address | Result |
|---|---|---|---|
| CoftraVault | Base Sepolia (84532) | `0x2335A6D769bb3f6E6D4B1a48f6926A81aEA5b719` | Identical (14,774 B, 5 immutables masked) |
| CoftraReactive | Reactive Lasna (5318007) | `0x17B29bC8400FB88de4c885Af4335983cd09c3D96` | Identical (8,600 B, 28 immutables masked) |
| CoftraMilestoneVerifier | Base Sepolia | `0x6AF465995710BA15db53D1a0F0867Ed4f38D3291` | Identical (954 B) |
| CoftraMockUSDC | Base Sepolia | `0xa4da96908af4cd2cb4dAAde2359deB221B4F03D5` | Identical (1,768 B) |
| CoftraDemoNFT | Base Sepolia | `0x08643a27E03AEef33daBb629091Cf15730b2d4FD` | Identical (3,570 B) |

**Compiler settings** (from `contracts/foundry.toml`): solc 0.8.30, optimizer on with 200 runs, `via_ir = true`, EVM version `cancun`. Library remappings: `@reactive` = reactive-lib-omni `3ade0dc`, OpenZeppelin `v5.4.0`.

**Constructor arguments**, confirmed against live contract state:

| Contract | Arguments |
|---|---|
| CoftraVault | `(0x476F44b11F5C942c58f4c8E3d0300E5710743585 callback proxy, 0x17B29bC8400FB88de4c885Af4335983cd09c3D96 reactive, 0x67b55ebde94ad5f3e25a8f78fb0ece4a971d575f admin)` |
| CoftraReactive | `(84532, 0x6AF465995710BA15db53D1a0F0867Ed4f38D3291, 0x08643a27E03AEef33daBb629091Cf15730b2d4FD, 0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70 Cron100, 300)` |
| CoftraDemoNFT | `(0xa4da96908af4cd2cb4dAAde2359deB221B4F03D5, 25000000, 0x67b55ebde94ad5f3e25a8f78fb0ece4a971d575f)` |
| CoftraMilestoneVerifier, CoftraMockUSDC | none |

## Commands (Sourcify, no API key)

Sourcify lists both chains as supported (`https://sourcify.dev/server/chains`, checked 2026-11-18). Run these from `contracts/`:

```bash
forge verify-contract 0x2335A6D769bb3f6E6D4B1a48f6926A81aEA5b719 src/CoftraVault.sol:CoftraVault --chain-id 84532 --verifier sourcify --constructor-args $(cast abi-encode "c(address,address,address)" 0x476F44b11F5C942c58f4c8E3d0300E5710743585 0x17B29bC8400FB88de4c885Af4335983cd09c3D96 0x67b55ebde94ad5f3e25a8f78fb0ece4a971d575f)
```

```bash
forge verify-contract 0x17B29bC8400FB88de4c885Af4335983cd09c3D96 src/CoftraReactive.sol:CoftraReactive --chain-id 5318007 --verifier sourcify --constructor-args $(cast abi-encode "c(uint256,address,address,uint256,uint64)" 84532 0x6AF465995710BA15db53D1a0F0867Ed4f38D3291 0x08643a27E03AEef33daBb629091Cf15730b2d4FD 0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70 300)
```

```bash
forge verify-contract 0x6AF465995710BA15db53D1a0F0867Ed4f38D3291 src/CoftraMilestoneVerifier.sol:CoftraMilestoneVerifier --chain-id 84532 --verifier sourcify
```

```bash
forge verify-contract 0xa4da96908af4cd2cb4dAAde2359deB221B4F03D5 src/test-assets/CoftraMockUSDC.sol:CoftraMockUSDC --chain-id 84532 --verifier sourcify
```

```bash
forge verify-contract 0x08643a27E03AEef33daBb629091Cf15730b2d4FD src/test-assets/CoftraDemoNFT.sol:CoftraDemoNFT --chain-id 84532 --verifier sourcify --constructor-args $(cast abi-encode "c(address,uint256,address)" 0xa4da96908af4cd2cb4dAAde2359deB221B4F03D5 25000000 0x67b55ebde94ad5f3e25a8f78fb0ece4a971d575f)
```

Check afterwards with `https://sourcify.dev/server/v2/contract/<chainId>/<address>`.

Basescan has its own verification and needs an Etherscan API key: add `--verifier etherscan --etherscan-api-key <key>` to the Base Sepolia commands. Whether Reactscan displays Sourcify results has not been confirmed.
