# Implementation status

_Last updated: 2026-11-25 (main at `e50a343`)_

## Summary

| Area | Planned | Implemented | Locally tested | Deployed | Verified end-to-end on testnet |
|---|---|---|---|---|---|
| CoftraVault (tasks, accounting, sessions, callbacks) | ✅ | ✅ | ✅ 41 Foundry tests, including fuzz and invariants | ✅ Base Sepolia | ✅ through the four recorded loops |
| CoftraReactive (subscriptions, react, cron, index) | ✅ | ✅ | ✅ simulated network | ✅ Lasna, MCP health HEALTHY, 5/5 subscriptions | ✅ through the four recorded loops |
| CoftraMilestoneVerifier | ✅ | ✅ | ✅ | ✅ Base Sepolia | ✅ CHECKPOINT and project CLOSEOUT |
| CHECKPOINT engine | ✅ | ✅ | ✅ | ✅ | ✅ Demo A (task 1) |
| CLOSEOUT engine | ✅ | ✅ | ✅ | ✅ | ✅ Demo B (task 3) and task 1 completing |
| FALLBACK engine (Reactive Cron) | ✅ | ✅ | ✅ | ✅ | ✅ Demo C (task 2) |
| Deployment scripts (4 steps, 2 chains) | ✅ | ✅ | ✅ ran on testnet | ✅ | — |
| Frontend: Overview, Proof Center, My Vaults, Create, Activity, Templates, Settings, task pages | ✅ | ✅ | typecheck, lint, 53 Vitest unit tests, production build; public pages checked in a browser against live data at desktop width and at 375 px | ✅ Vercel | ⏳ Screens that need a wallet haven't been run with a real wallet yet (see [Product additions](#product-additions-2026-11-25-frontend-only)) |
| Security review + threat model | ✅ | ✅ | — | — | — |
| CI (GitHub Actions: secrets guard, web, contracts, Slither) | ✅ | ✅ | ✅ green on all 11 pushes to main | — | — |

The contracts, the four recorded loops, the hosted app, the public repository and CI are done. Still open: a real-wallet run of the newest screens ([WALLET_TEST.md](demo/WALLET_TEST.md), part H), user testing ([plan](demo/USER_TESTING.md), no results claimed) and the demo video.

## Deployment (2026-11-17)

Deployer: `0x67b55ebde94ad5f3e25a8f78fb0ece4a971d575f`. Every transaction below confirmed; contract code and wiring were checked afterwards with `cast` and the Reactive MCP.

| Contract | Chain | Address | Deploy tx |
|---|---|---|---|
| CoftraMockUSDC (tUSDC, test only) | Base Sepolia | `0xa4da96908af4cd2cb4dAAde2359deB221B4F03D5` | `0x060619ff34808c2f5f7cddf0deaedb14ed277f53c76b35888563745864a37760` |
| CoftraMilestoneVerifier | Base Sepolia | `0x6AF465995710BA15db53D1a0F0867Ed4f38D3291` | `0x83de4f48284474ab6e5060f7981cc6ae038f772c437a097cd4d6632e0813c1d0` |
| CoftraDemoNFT | Base Sepolia | `0x08643a27E03AEef33daBb629091Cf15730b2d4FD` | `0xb6db1b7ec05a14bcfb0e1e4639f9b08ea06c5c50d5238b03775483500fa42e73` |
| CoftraReactive | Reactive Lasna | `0x17B29bC8400FB88de4c885Af4335983cd09c3D96` | `0xadb9e98fed9b9187be891389856976c87fee749370a0c7005d0c026447607329` |
| CoftraVault | Base Sepolia | `0x2335A6D769bb3f6E6D4B1a48f6926A81aEA5b719` | `0x265fd594ff6acb6a6bfc651a94c226da8a16bc91fed9dad17f16d5494d91440d` |

Wiring transactions:
- `registry.setVault`, Base Sepolia: `0x90ae60cfb104f4e617ad6adcca760daca5cd88c0f91994a3ad87f2470d8726ee`
- `vault.setTokenAllowed(tUSDC, true, 1e6)`, Base Sepolia: `0xd491a708a8ce2424ee7c073b4b5d25b457b2b46bc43bc9abf71b9a6b51afea47`
- `rc.setVault`, Lasna (adds the 3 vault-event subscriptions): `0xe68cd3f052c7594f36686ecd3a8e48d2446ba1c0445ba1ffae850770df78f1d8`
- `SYSTEM.depositTo(rc)` 0.5 lREACT reserve, Lasna: `0x0639bbb34430b5bc9d7a7edf81b71c1e0ebb8cf76febeecf88e9d9cf397bcdd5`

Checked on-chain after deployment:
- `vault._CALLBACK_SENDER` = RC; `vault._SERVICE_PROVIDER` = callback proxy `0x476F…3585`
- `registry.vault` = vault; tUSDC allowed with a 1 tUSDC minimum; vault holds 0.002 ETH for callbacks
- MCP `get_rc_health`: HEALTHY (no debt, 0.5 lREACT reserves plus 2 lREACT balance, 0 reverts)
- MCP `list_subscriptions`: 5 active (registry `MilestoneVerified`; NFT mints; vault `TaskActivated` / `DeadlineExtended` / `TaskClosed`), topic0s match `cast keccak`, none made from the deployer EOA. Cron subscribes only when a task activates.

Issue found and fixed during live testing: `sepolia.base.org` limits `eth_getLogs` to 200 blocks (HTTP 413), and Lasna caps it at 30,000. The app now defaults to `base-sepolia-rpc.publicnode.com` and reads Lasna in 25,000-block chunks.

## Live deployment

- App: https://web-two-pied-ft7sms1616.vercel.app/ (Vercel, root directory `apps/web`)
- Proof Center, no wallet needed: https://web-two-pied-ft7sms1616.vercel.app/proof
- Judge guide: [JUDGE_QUICKSTART.md](JUDGE_QUICKSTART.md)

## Final audit (2026-11-18)

| Check | Result |
|---|---|
| Four recorded loops re-verified from raw receipts and current state | ✅ 60/60 checks (`cd apps/web && pnpm verify:proofs`; re-run 2026-11-25, all passed) |
| Deployed bytecode vs current source | ✅ All 5 contracts identical apart from immutables (`docs/deployment/VERIFY_SOURCE.md`) |
| Source verification | ✅ All 5 contracts verified on Sourcify, exact match for runtime and creation (2026-11-25; see `docs/deployment/VERIFY_SOURCE.md`). Basescan not submitted (needs an API key) |
| Real-wallet website test | ⏳ Not completed. Only wallet connection has been tried so far (reported working; no evidence recorded). Step-by-step plan in `docs/demo/WALLET_TEST.md`, parts A–H |
| User testing | ❌ Not run; guide in `docs/demo/USER_TESTING.md` |
| Reactive reserve | 3.2578 lREACT, no debt, cron off, after a 1.2 lREACT top-up (Lasna tx `0x92f3aa5261b752ba0c7075d5d983c04f56c8a4a04f2623ace2f790664803918e`, 2026-11-18). Covers ≈6.9 h of open-task automation at the measured rate (≈11.3 lREACT per day). Still 3.2578 lREACT on 2026-11-25 (no task open, so nothing is billed). A larger top-up is still recommended before judging |
| Frontend fixes | Cancelled or replaced transactions no longer shown as confirmed; writes pinned to Base Sepolia; slow-transaction hint; runway warnings; shareable `/proof/<id>` pages |

## Added 2026-11-25 (frontend only, no contract change)

- **Private task names:** saved only in the browser; the contract stores none. Editable on the task page, shown in lists, optional in the Rule Builder.
- **Rule Builder presets:** freelancer in two stages, grant with three milestones, bot mints one NFT, and a 15-minute FALLBACK demo.
- **Deadline countdown** on task pages, plus a downloadable calendar reminder (.ics, generated in the browser).
- **"Keep automation running" card** in Settings: anyone can add lREACT to the reactive contract's reserve through the official `depositTo`. Network check, 10 lREACT cap, non-refundable acknowledgement.
- **"Copy link to this task"**: task pages are public and need no wallet.
- Rendering verified in headless Chrome against the production build. The builder presets and the Lasna top-up need a connected wallet and have not been exercised in a real wallet yet.
- Ideas that need a contract change: [ROADMAP.md](ROADMAP.md).

## Product experience upgrade (merged into main 2026-11-25)

Frontend only; deployed contracts and addresses unchanged.

| Area | What changed | Evidence |
|---|---|---|
| Task creation (P0) | Builder transaction arguments are now pure functions (`lib/tx-builders.ts`) | Fork simulation against live contract code: exact approval → create → attest → owner override → session spend → cancel and refund all pass (`COFTRA_FORK_RPC=… pnpm test`) |
| Replay | Step-through of the four recorded loops with vault state per step, on `/proof` and each receipt | Headless render; replay data unit-tested |
| Automation health | Freshness and Stale flag, watched tasks with vault-confirmed state, recent callbacks | Headless render |
| Rule Builder | WHEN / THEN / OTHERWISE diagram from the same input as the contract arguments | Unit tests compare the diagram with the exact call arguments |
| Receipts | Asset movements table and embedded replay on `/proof/<id>` | Unit test: every movement cites a transaction from its own loop |
| Safety inspector | Flags risky configurations; warnings must be acknowledged before Create | Unit tests (7) |
| Guided first automation | Dismissible checklist ticked from wallet and chain state | Typecheck and lint only; needs a wallet to exercise |
| Prerender fix | `useNow` no longer reads the clock during prerender (Next.js 16 blocked the build) | Production build passes |

Tests: Foundry 41/41 · Vitest 21/21 with fork (19 + 2 skipped without) · tsc 0 · lint 0 · build 16/16 pages · `verify:proofs` 60/60.

## Product additions (2026-11-25, frontend only)

Built on main between `e8ada6e` and `e50a343`. No contract, address, ABI or transaction-argument change: the Rule Builder still sends exactly what `lib/tx-builders.ts` builds.

"Checked in a browser" means the screen was opened and inspected, on the live site or a local production build reading live chain data. "Real wallet" means exercised with a connected browser wallet, which hasn't happened yet for any screen below that needs one.

| Feature | Where | Unit tests | Checked in a browser | Real wallet |
|---|---|---|---|---|
| Editorial redesign: parchment palette, Instrument Serif + IBM Plex Mono (OFL), top navigation, footer, pill buttons | Every page | — | ✅ Desktop and 375 px | Not needed |
| Animated pipeline under the hero. Labelled "Illustration, not live activity"; pauses off-screen; vertical on phones | Overview without a wallet | — | ✅ Desktop and phone. The reduced-motion path was only checked in code | Not needed |
| Proof Center as five stages per recorded run (origin, Reactive execution, callback request, destination transaction, verified outcome), with status in words as well as colour | `/proof`, `/proof/<id>` | 7 (recorded evidence) | ✅ Live site, every receipt re-checked | Not needed |
| Plain-language task story, CSV download, printable receipt | Task pages | 5 (story and CSV) | ✅ Story on tasks 1–3; CSV contents captured on the live site. The print dialog wasn't opened | Not needed |
| Recipient and executor views: "Paying me" and "I can spend" tabs, recipient card | My Vaults, task pages | 4 | Needs a connected recipient or executor | ❌ Not yet |
| Contacts: private names shown next to addresses and in stories and receipts | Settings → Contacts | 2 | ✅ Saved a contact; the name appeared on task 1 | Not needed |
| Recipient share link (`/tasks/<id>?for=recipient`) | Task pages, project budgets | — | ✅ Live site | Not needed |
| "What needs you": open tasks, most urgent first, including tasks you verify | Overview, wallet connected | 2 | Needs a wallet | ❌ Not yet |
| Export all your tasks as one CSV | My Vaults | 1 | Needs a wallet | ❌ Not yet |
| "What will happen": every case the rule allows and where the money ends up | Rule Builder, Review step | 7 | Needs a wallet | ❌ Not yet |
| Saved templates: save at Review or from a task you own; reuse from Create or Templates (`/create?saved=<id>`) | Create, Templates, task pages | 10 | ✅ Templates list, "Use" link and remove, with a sample stored only in the browser | ❌ Builder reuse and "Save as template" not yet |
| Pop-ups when Reactive Network acts on one of your tasks | Every page, wallet connected | 3 | Needs a live Reactive event while the page is open | ❌ Not yet |
| Page titles, a main heading on proof pages, 24 px minimum tap targets | All pages | — | ✅ | Not needed |

Tests at `e50a343`: Foundry 41/41 · Vitest 53 passed, plus 2 fork tests skipped without a fork RPC · tsc 0 · lint 0 · production build passes · `verify:proofs` 60/60 · CI run #11 green.

## Official submission checklist

Source: https://dorahacks.io/hackathon/reactive-omni-buildathon/detail and the /tracks page, read 2026-11-17.

- **Deadline:** 2026-12-05 21:00 (UTC+1). The submission window opened 2026-11-05 13:00.
- **Track:** Set It and Forget It. Prizes $2,000 / $250, paid in REACT.
- **Network:** Reactive mainnet or Lasna, plus any supported chain.

| Requirement | Status |
|---|---|
| Link to a public, open-source repository | ✅ https://github.com/Chima30/coftra (CI green on first push) |
| Deployed contract addresses | ✅ See Deployment above |
| A few transaction hashes showing origin event → callback | ✅ Four full loops, see Verified evidence |
| Demo video under three minutes | ❌ Not recorded (outline in `docs/demo/DEMO.md`) |
| Everything built during the event (Nov 5 – Dec 5) | ✅ Built from 2026-11-17 |
| On Base Sepolia, use timestamps rather than block counts for timers, cooldowns and deadlines (200 ms blocks) | ✅ Every deadline, cooldown and retry uses `block.timestamp` |

Judging: four equally weighted criteria, each scored 1–5.
- **Execution:** entries without on-chain reactive transactions and callbacks are not scored further. ✅
- **Integration:** does the reactive contract do real work? ✅
- **Usefulness:** does it solve a problem real users have? Untested with real users.
- **Craft:** readable code, a working demo, and documentation someone else could follow.

The track asks for "a tool you'd actually keep running", "a clear personal purpose" and "a creative take on event-driven logic". The README and video should lead with the personal use case: paying someone in stages, or letting a bot spend a capped amount, without staying online.

Change made because of these rules: Base Sepolia's 200 ms blocks mean about 432,000 blocks per day, so the frontend now reads logs in 45,000-block ranges, four at a time, splitting any range an RPC rejects.

## What was verified, and how

- **Reactive Omni API:** confirmed against the Reactive MCP (`get_network_info`, `plan_rc`, `get_rc_template`, `search_docs`, `estimate_cost`) and the `reactive-lib-omni` source at commit `3ade0dc` (`AbstractReactive`, `AbstractCallback`, `ISystemContract.requestCallbackV_1_0`, `LogRecord`). No legacy APIs are used. `check_rc_source` found no pitfall patterns.
- **Networks:** Lasna 5318007 and Base Sepolia 84532 both answered `cast chain-id`. The Base Sepolia callback proxy is `0x476F44b11F5C942c58f4c8E3d0300E5710743585`.
- **Lasna compatibility:** the `CoftraReactive` creation code (cancun EVM) was run through `eth_call --create` on the live Lasna RPC. It returned runtime bytecode, so the constructor, including `SYSTEM.subscribe`, executes there. Nothing was broadcast.

## Tests run (2026-11-25)

```
forge test            → 41 passed, 0 failed (3 suites: scenarios, fuzz, invariants)
pnpm test (Vitest)    → 53 passed, 2 skipped (fork tests; run with COFTRA_FORK_RPC)
pnpm typecheck        → pass
pnpm lint             → pass
pnpm build            → pass
pnpm verify:proofs    → 60/60 checks passed (read-only, against both chains)
GitHub Actions        → 11 of 11 runs on main green (secrets guard, web, contracts, Slither)
```

## Tests run (2026-11-17)

```
forge test        → 40 passed, 0 failed
  CoftraLifecycleTest   35 scenario tests (CHECKPOINT, CLOSEOUT, FALLBACK, auth, races, recovery, SR regressions)
  CoftraFuzzTest         4 fuzz tests × 512 runs
  CoftraInvariantTest    4 invariants × 128 runs × 64 depth (8,192 handler calls, 0 reverts)
slither 0.11.6    → 0 High after triage (1 reviewed false positive suppressed inline, see SECURITY_REVIEW SR-5)
pnpm typecheck    → pass
pnpm lint         → pass
pnpm build        → pass (Next.js 16.4.6, all routes)
```

The local tests use a mock system contract with real wildcard filtering. Logs flow through a simulated subscription filter into `react()`, then through a callback queue to proxy delivery with the RC address injected. **This models the network but is not evidence of Reactive execution.**

## Files

- `contracts/src/`: `CoftraVault.sol`, `CoftraReactive.sol`, `CoftraMilestoneVerifier.sol`, `interfaces/ICoftraVault.sol`, `test-assets/{CoftraMockUSDC,CoftraDemoNFT}.sol`
- `contracts/test/`: `CoftraLifecycle.t.sol`, `CoftraFuzz.t.sol`, `CoftraInvariants.t.sol`, `utils/{MockSystem,CoftraFixture,TestTokens}.sol`
- `contracts/script/Deploy.s.sol`
- `apps/web/`: Next.js app (`src/views/*`, `src/components/*`, `src/lib/*`, `scripts/sync-contracts.mjs`)
- `docs/`: architecture, security review, deployment, demo runbook, user-testing plan
- `.github/workflows/ci.yml`, `.env.example`, `.gitignore`

## Previously blocked on authorization (all done)

1. ✅ **Testnet deployment** (`docs/deployment/DEPLOY.md`, steps 1–4), signed by the owner's keystore on 2026-11-17.
2. ✅ **Demo A/B/C transactions** (`docs/demo/DEMO.md`). See Verified evidence below.
3. ✅ **Vercel deployment** of `apps/web`: https://web-two-pied-ft7sms1616.vercel.app/
4. ✅ **Public GitHub repository and CI**: https://github.com/Chima30/coftra, green on every push to main.

## Still needs the owner

1. **Real-wallet run** of the website, especially the newest screens ([WALLET_TEST.md](demo/WALLET_TEST.md), part H). Every transaction is signed in the owner's own wallet.
2. **A larger reserve top-up** on Lasna before judging (Settings → Keep automation running), so automation keeps running while tasks are open.
3. **User testing** ([plan](demo/USER_TESTING.md)). No results are claimed until it has run.

## Verified evidence

Each row was checked three ways: the receipts on both chains (`cast`), the Reactive MCP (`trace_origin_event` / `trace_reactive_tx`: react() succeeded and requested exactly one callback), and the vault event `ReactiveCallbackHandled`, whose `originTxHash` topic links back to the origin. The Proof Center rebuilds the same three hops from chain data.

| Workflow | Origin tx | Reactive tx (Lasna) | Destination tx (Base Sepolia) | Verified outcome |
|---|---|---|---|---|
| CHECKPOINT (task 1) | `0xd14aab0c1ba0d840139b1b6e0d97491e464581b0c3435ff5995876037f4560ce` (Base Sepolia, `attest(1, 0, 1)`) | `0xf584e835f25d1fd4e5d3d24c44ef8169248fd2245d676eff0427e94c1d13682c` | `0x6c2d47492b3a67cfae829059840563e11816097fc562b3c14374a36109b42868` | Result Applied. 30 tUSDC vault → recipient `0x1aB0…5280`; `MilestoneReleased(1, 0)`; checkpoint 1 can't be attested again |
| CLOSEOUT (task 3, spending session) | `0x0cb519ee7ed7a9894a790ce0a8c2cd34ac8e6fc6f738ba13d453173e0503f99f` (Base Sepolia, bot `executeSession` → `CoftraDemoNFT` mint `Transfer(0, owner, 1)`) | `0x1c03e0d5b22b94df6008bd788f3988b71c84f4ff156418e3702304030c8deba4` | `0xd26d202b13f207173a73fff75a96c149370c5e12c89dee186add4eeb24b9c5fa` | Result Applied about 2 s after the mint (8 Base Sepolia blocks at 200 ms). Task 3 Completed; executor `0x84BF…e264` revoked; spent exactly 25 of the 25 cap; NFT #1 owned by the owner; 15 tUSDC unspent returned; outcome slot cleared. A second `executeSession` by the bot reverts with `WrongState(3)` (read-only `eth_call`) |
| CLOSEOUT (task 1, project budget completes) | `0x4330a5abe5a213614a0213510f666475028cbce361e499a3013ef53aed7d4846` (Base Sepolia, `attest(1, 1, 1)`, last checkpoint) | `0xae198bcdaae3c6b8e992f5607413cf0adb83a17081557987a84a6e7153552311` | `0xe917b2f438bdf9ebac2bf2a63cb85df473093a1fabe0d0c8a1217c29a28bc9ed` | Result Applied. 50 tUSDC to the recipient (80 in total); task 1 Completed; the 20 tUSDC reserve returned to the owner; the RC untracked the task and unsubscribed from cron (no open tasks) |
| FALLBACK (task 2) | `0x612b3e7c48e85f5ea33681fce1c6e8afb6555290929733a1423b909208a2b5e6` (Lasna Cron tick from `0x…fffFfF`) | `0x5c48cda6f98fd703c6b0562dca07def027df9be65f035826c70f8e59cb25fb49` | `0x00f052cdfd2f5f5e6eab4338610b1bef9702ef8ef8f833b57d85467761a0bf21` | Result Applied. Task 2 Expired 77 s after its deadline (the next Cron100 tick) with nobody online; 20 tUSDC returned to the owner; the RC saw `TaskClosed` and stopped tracking task 2 |

Demo B setup (Base Sepolia, `script/DemoB.s.sol`, signed by the owner): exact 40 tUSDC approve `0xfd3ffb3cebaca5c79af6478b70941e0852616ad8d0896aebc68d3780e7d197f9`, create session `0x90bd30285fc73e670e30ecb53f6830a3113cda6bbbc40651ec9ae5ee96b31271`. The owner's balance went from 860 to 900 tUSDC: +15 refund, and +25 because the deployer is also the demo NFT's treasury.

Setup transactions for Demos A and C (Base Sepolia, `script/Demo.s.sol`): create task 1 `0xf4edc766a4e8dc24cc31201e52d05c8322fd5132e61be9434380c84094f0301a`, create task 2 `0xfb747b64291794ac8b35b07a9bb0217be7e459a76f0eac50666a22719e174838`.

Observed costs (from receipts): CHECKPOINT callback 161,866 gas (≈0.00000097 ETH), FALLBACK callback 143,452 gas (≈0.00000086 ETH); react() used 78,678 and 95,207 gas. The MCP measured the callback proxy overhead at 130,000 gas, and Funding Health now uses that figure.

**Funding finding (2026-11-17).** Reaction fees on Lasna were billed from the RC's system-contract reserves only. The 2 lREACT sent to the payable constructor stayed in the contract balance while reserves fell from 0.5 to 0.134 lREACT in about 90 minutes, with Cron100 running because task 1 was open. Fixes:
- Moved the balance into reserves (Lasna, `script/Deploy.s.sol:Step5_BalanceToReserves`): `rc.withdraw` `0xc0bc5c850c27930bc12037f6fec018387e5bee795699abdd187ae65566eb3251`, `SYSTEM.depositTo` `0xc79576803a1a4bcb224156723c401e6bfdf46a22ea2e46222f0eb1c628d2c409`. Reserves afterwards: 2.058 lREACT, debt 0.
- Funding Health now counts only reserves as runway and shows the contract balance as "not billed".
- Deploy defaults now fund reserves (`RC_RESERVE_WEI`, 2 lREACT) instead of the constructor balance (`RC_FUNDING_WEI`, 0).
- Operating note (measured 2026-11-18 from archive reserves): while any task is open, the deployment spends about 0.0079 lREACT per minute (≈11.3 per day), mostly Cron100 ticks. A 2.06 lREACT reserve covers about 4.4 hours of open-task time. Use `DEMO_FAST_CRON=false` (Cron1000) outside demos.

Issue found and fixed during this run: Lasna receipts for reactive transactions have `effectiveGasPrice: null` (fees are billed to reserves), which crashed the proof cost line. The Proof Center now shows react() gas used instead.

## Known limitations

- Public RPC `getLogs` limits vary. The reader halves its block range on errors, but a very old deployment on a strict RPC will load slowly. Task pages read the vault's whole history, so the plain-language story can take several seconds to appear.
- Screens that need a connected wallet are unit-tested and type-checked but haven't been run with a real wallet yet (see the table under Product additions).
- Task names, contacts and saved templates live in one browser only. They don't follow you to another device, and clearing site data removes them.

Resolved since the first version of this file: the frontend data paths (multicall reads, chunked `getLogs`, proof reconstruction across both RPCs) now run against the live contracts on the hosted app, and CI has run green on GitHub, including the Slither action and the web job's `--frozen-lockfile`.

## Next stage

Real-wallet run of parts A–H in [WALLET_TEST.md](demo/WALLET_TEST.md) → check every hash on-chain and record it here → user testing with the [plan](demo/USER_TESTING.md).

## Task Health, spending policy and recovery confirmations (27 Nov 2026)

Frontend-only; contracts, ABIs, addresses and the four recorded proofs unchanged. See [TASK_HEALTH_AND_POLICY.md](TASK_HEALTH_AND_POLICY.md).

| Feature | Unit-tested | Browser-checked | Real wallet |
| --- | --- | --- | --- |
| Task Health (task page card, task-row badge, Overview summary) | yes (7 tests) | task page, read-only, on task #4 | not yet |
| Spending policy and "who can move funds" | — | task page, read-only | not yet |
| Confirmations for cancel, manual fallback, extend deadline | — | — | not yet |
| Proof Center: trigger, final state, contracts per run | — | yes | n/a |
| Keep showing earlier data when a refresh fails, with its time | — | — | n/a |
