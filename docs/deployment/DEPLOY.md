# Deploying Coftra (Base Sepolia + Reactive Lasna)

All values below were checked on 2026-11-17 with the Reactive MCP (`get_network_info`, lasna):

| | |
|---|---|
| Lasna chain id | 5318007 |
| Lasna RPC | `https://lasna-rpc.rnk.dev/` |
| Lasna explorer | `https://lasna.reactscan.net` |
| System contract | `0x8888888888888888888888888888888888888888` |
| Base Sepolia callback proxy | `0x476F44b11F5C942c58f4c8E3d0300E5710743585` |

## Prerequisites

- Foundry (tested with forge 1.9.0), Node 22, pnpm 10.
- One deployer address with:
  - Base Sepolia ETH, for deployments plus about 0.002 ETH of callback funding.
  - lREACT on Lasna. Get it by sending Sepolia ETH to the Reactive faucet: on Base Sepolia, `request(address)` on `0x2afaFD298b23b62760711756088F75B7409f5967` (1 ETH → 100 lREACT, max 5 ETH per transaction).
- A Foundry keystore, so no raw key ever sits in a file:

```bash
cast wallet import coftra-deployer --interactive
```

## Steps

Run these from `contracts/`. Each step appends to `deployments/base-sepolia.json`.

```bash
git submodule update --init --recursive && forge build && forge test
```

```bash
forge script script/Deploy.s.sol:Step1_Assets --rpc-url $BASE_SEPOLIA_RPC_URL --account coftra-deployer --broadcast
```

```bash
forge script script/Deploy.s.sol:Step2_Reactive --rpc-url $LASNA_RPC_URL --account coftra-deployer --broadcast
```

```bash
forge script script/Deploy.s.sol:Step3_Vault --rpc-url $BASE_SEPOLIA_RPC_URL --account coftra-deployer --broadcast
```

```bash
forge script script/Deploy.s.sol:Step4_Link --rpc-url $LASNA_RPC_URL --account coftra-deployer --broadcast
```

The Reactive docs use `--verify --verifier sourcify` for Lasna (dev.reactive.network/reactive-contracts#verify-on-deployment). If an RPC rejects EIP-1559 transactions, add `--legacy`.

**Fund reserves, not the contract balance.** On Lasna, reaction fees come out of the RC's reserves at the system contract. REACT sent to the payable constructor sits in the contract balance and is not billed, so Step4 deposits `RC_RESERVE_WEI` (default 2 lREACT) with `depositTo`. `Step5_BalanceToReserves` moves any balance that is already there.

Optional environment knobs are listed in `.env.example`: `RC_RESERVE_WEI`, `RC_FUNDING_WEI`, `VAULT_CALLBACK_FUNDING_WEI`, `DEMO_FAST_CRON`, `RC_RETRY_SECONDS`, `VAULT_ADMIN`.

Why this order: the vault pins the RC address as its only allowed callback sender (immutable), so the RC deploys first. The RC learns the vault address through a one-time `setVault`, which also subscribes it to the vault's lifecycle events.

## Verify

```bash
forge verify-contract <VAULT> src/CoftraVault.sol:CoftraVault --chain base-sepolia --verifier sourcify
```

```bash
forge verify-contract <RC> src/CoftraReactive.sol:CoftraReactive --chain-id 5318007 --verifier sourcify --rpc-url $LASNA_RPC_URL
```

Then check the live setup with the Reactive MCP: `get_rc_health <RC>`, `list_subscriptions <RC>`, and `validate_subscription` for the registry and NFT filters.

## Frontend

```bash
cd ../apps/web && pnpm install && pnpm sync:contracts && pnpm build
```

`sync:contracts` copies ABIs from `contracts/out` and the addresses from `deployments/base-sepolia.json` into `src/lib/contracts/generated.ts`. Deploy `apps/web` to Vercel with root directory `apps/web`. Only the public `NEXT_PUBLIC_*` RPC variables are needed.

## Operating costs (estimates, labelled as such)

From MCP `estimate_cost` with live fee parameters on 2026-11-17:
- About 0.022 lREACT per reaction.
- Cron100 left on all day ≈ 18 lREACT/day; Cron1000 ≈ 1.8 lREACT/day.
- About 0.000002 ETH per Base Sepolia callback.

The RC only subscribes to cron while it is tracking an open task, so an idle deployment pays no cron fees. Set `DEMO_FAST_CRON=false` for longer-running deployments.
