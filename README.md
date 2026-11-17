# Coftra

Most on-chain tasks don't end when the transaction is sent. Someone still has to check the outcome, manage permissions, release payments or recover leftover funds. Coftra automates those steps using verifiable blockchain events.

You fund a task, set its rules, and close the tab. [Reactive Network](https://dev.reactive.network/) watches for the events that matter, and a self-custodial vault applies the outcome: it releases a milestone, closes a spending session, or returns what's left when the deadline passes. Every step leaves a proof trail you can open on a block explorer.

> **Status:** testnet only (Base Sepolia + Reactive Lasna). Contracts are deployed, and CHECKPOINT, CLOSEOUT and FALLBACK are each proven end to end on testnet. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md). Not audited. Don't use it with real funds.

## Who it helps

- **People paying in stages:** grant programs, DAOs, and clients of freelancers. Money is released per verified milestone, and the reserve comes back automatically.
- **People delegating one action:** a bot minting an NFT for you, for example. It gets a capped, single-purpose budget that shuts off by itself once the job is done.

## The three engines

| Engine | Trigger | What the vault does |
|---|---|---|
| **CHECKPOINT** | The named verifier calls `attest()` on the registry | Re-checks verifier, config version and deadline, then pays exactly that milestone, once |
| **CLOSEOUT** | Last milestone released, or the paid-for NFT is minted to you | Revokes the executor, settles accounting, returns unspent funds |
| **FALLBACK** | A Reactive Cron tick after the deadline | Re-checks the deadline on Base Sepolia, freezes payouts, keeps completed ones, returns the rest |

All three share one lifecycle (`Funded → Active → Completed | Expired | Cancelled`) and one exit path in the contract. See [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).

## How Reactive Network does the work

```
Base Sepolia                      Reactive Lasna                         Base Sepolia
──────────────                    ───────────────                        ──────────────
Registry: MilestoneVerified ─┐
DemoNFT: Transfer(0, you, id) ─┼─► CoftraReactive.react()  ─ requestCallbackV_1_0 ─►  callback proxy
Vault: TaskActivated/Closed ──┘     ├ relays attestations / mints                       └► CoftraVault.onX(rvmId, …)
                     Cron tick ───► ├ keeps an index of open deadlines                     re-validates, applies or
                                    └ on cron: requests expiry checks                      records why not
```

- **Essential, not decorative.** Nobody has to be online when a deadline passes or a mint lands. Without Reactive, someone would run a keeper bot. With it, the browser and any server are optional.
- **Authenticated.** Callbacks must come from the official proxy and carry our RC's address (`onlyServiceProvider` + `onlyCallbackSender`). Subscriptions are pinned to specific emitters.
- **Idempotent and acknowledged.** Duplicate deliveries are no-ops. Because the network doesn't retry callbacks, the RC re-requests overdue expiries until it sees the vault's `TaskClosed`.
- **Cheap when idle.** The RC subscribes to cron only while a task is open.

## What makes it different

- **Proof Center.** Each automated step is rebuilt from chain data alone: origin tx → Lasna reactive tx → destination tx, with result, balance changes and costs. There's no indexer, and nothing simulated.
- **Safety Preview.** The rule is shown in plain language before you sign, generated from the same values the contract will enforce. Approvals are always exact amounts.
- **Funding Health.** Live balances and debts on both chains, with labelled cost estimates. Activation is blocked when automation couldn't run.
- **Never stuck.** The owner can release a milestone directly, and anyone can run the fallback by hand 30 minutes after a deadline.

## Repository

```
contracts/   Foundry: src/, test/ (unit, fuzz, invariant), script/Deploy.s.sol
apps/web/    Next.js 16 + wagmi/viem + TanStack Query + Tailwind
docs/        architecture/, security/, deployment/, demo/, IMPLEMENTATION_STATUS.md
```

## Run locally

```bash
git clone --recursive <repo> && cd coftra/contracts && forge build && forge test
```

```bash
cd apps/web && pnpm install && pnpm sync:contracts && pnpm dev
```

Without a deployment record, the app shows its explanatory pages and says that no live data exists. It never shows placeholder numbers.

## Deploy

Four steps across two chains, using a keystore account. See [docs/deployment/DEPLOY.md](docs/deployment/DEPLOY.md). The demo transactions are in [docs/demo/DEMO.md](docs/demo/DEMO.md).

## Tests

40 Foundry tests:
- **Scenarios:** every engine, callback authentication, forged emitters, duplicate events, completion/expiry races, failed transfers, cross-task isolation, fee-on-transfer rejection, manual recovery.
- **Fuzz:** conservation of funds, deadline boundaries, spend bounds, random callbacks.
- **Invariants:** solvency, liability accounting, single settlement, caps, and RC index consistency, all run through a simulated Reactive pipeline.

Slither runs in CI, along with TypeScript, ESLint and a production build.

## Live evidence

Deployed on Base Sepolia (vault `0x2335A6D769bb3f6E6D4B1a48f6926A81aEA5b719`) and Reactive Lasna (reactive contract `0x17B29bC8400FB88de4c885Af4335983cd09c3D96`).

| Workflow | Origin | Reactive tx (Lasna) | Destination callback (Base Sepolia) | Outcome |
|---|---|---|---|---|
| CHECKPOINT | [`0xd14aab…`](https://sepolia.basescan.org/tx/0xd14aab0c1ba0d840139b1b6e0d97491e464581b0c3435ff5995876037f4560ce) attestation | [`0xf584e8…`](https://lasna.reactscan.net/tx/0xf584e835f25d1fd4e5d3d24c44ef8169248fd2245d676eff0427e94c1d13682c) | [`0x6c2d47…`](https://sepolia.basescan.org/tx/0x6c2d47492b3a67cfae829059840563e11816097fc562b3c14374a36109b42868) | 30 tUSDC released to the recipient |
| CLOSEOUT (project) | [`0x4330a5…`](https://sepolia.basescan.org/tx/0x4330a5abe5a213614a0213510f666475028cbce361e499a3013ef53aed7d4846) last checkpoint attested | [`0xae198b…`](https://lasna.reactscan.net/tx/0xae198bcdaae3c6b8e992f5607413cf0adb83a17081557987a84a6e7153552311) | [`0xe917b2…`](https://sepolia.basescan.org/tx/0xe917b2f438bdf9ebac2bf2a63cb85df473093a1fabe0d0c8a1217c29a28bc9ed) | Task completed, 20 tUSDC reserve returned, cron switched off |
| FALLBACK | [`0x612b3e…`](https://lasna.reactscan.net/tx/0x612b3e7c48e85f5ea33681fce1c6e8afb6555290929733a1423b909208a2b5e6) Cron tick | [`0x5c48cd…`](https://lasna.reactscan.net/tx/0x5c48cda6f98fd703c6b0562dca07def027df9be65f035826c70f8e59cb25fb49) | [`0x00f052…`](https://sepolia.basescan.org/tx/0x00f052cdfd2f5f5e6eab4338610b1bef9702ef8ef8f833b57d85467761a0bf21) | Task expired with nobody online; 20 tUSDC returned |
| CLOSEOUT | [`0x0cb519…`](https://sepolia.basescan.org/tx/0x0cb519ee7ed7a9894a790ce0a8c2cd34ac8e6fc6f738ba13d453173e0503f99f) bot mints the NFT | [`0x1c03e0…`](https://lasna.reactscan.net/tx/0x1c03e0d5b22b94df6008bd788f3988b71c84f4ff156418e3702304030c8deba4) | [`0xd26d20…`](https://sepolia.basescan.org/tx/0xd26d202b13f207173a73fff75a96c149370c5e12c89dee186add4eeb24b9c5fa) | Session closed, bot revoked, 15 tUSDC returned, owner holds the NFT |

Full details and how each hop was verified: [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md#verified-evidence).

## Security

There's an internal review and threat model in [docs/security/SECURITY_REVIEW.md](docs/security/SECURITY_REVIEW.md); three issues were found and fixed. Trust assumptions:
- Milestone verifiers are trusted for their own milestones.
- The vault admin can only pause new tasks, manage the token allow-list, and withdraw native callback-gas funds. The admin can never touch task balances.

There has been no independent audit.

## Future work

- k-of-n verifiers.
- Per-session dynamic subscriptions.
- Verifier registries on other chains.
- More vetted session targets.
- An independent audit before any mainnet use.

## Tech stack

Solidity 0.8.30, Foundry, OpenZeppelin 5.4, reactive-lib-omni · Next.js 16, TypeScript (strict), Tailwind 4, wagmi 2, viem 2, TanStack Query 5, lucide.
