# DoraHacks submission draft

Copy these fields into the build form at https://dorahacks.io/hackathon/reactive-omni-buildathon/detail. Everything here is taken from verified records in `IMPLEMENTATION_STATUS.md`. Replace the video placeholder before submitting.

**Deadline:** 2026-12-05 21:00 (UTC+1)

---

**Name:** Coftra

**Track:** Set It and Forget It

**One-line description (tagline):**
Fund an on-chain task and walk away: Reactive Network pays verified milestones, closes temporary spending permissions when the job is done, and refunds what's left at the deadline.

**Description:**

On-chain tasks don't end when the transaction is sent. Someone still has to check the outcome, release payments, revoke temporary permissions and recover leftover funds. Coftra does those steps for you, triggered by verifiable on-chain events through Reactive Network, so nobody has to stay online.

You deposit into a self-custodial vault on Base Sepolia, under one of two rules:

- **Conditional Project Budget:** pay someone in stages. Each checkpoint is released only after the verifier you named attests it on-chain. A reserve always comes back to you.
- **Temporary Spending Session:** let a bot spend a capped amount on exactly one action (minting an NFT to you). Its access ends by itself once the outcome is observed.

Three engines share one lifecycle:
- **CHECKPOINT** pays a verified milestone exactly once.
- **CLOSEOUT** finishes the task when the outcome happens, revoking the executor and refunding the rest.
- **FALLBACK** expires an overdue task from a Reactive Cron tick and refunds the unspent balance.

The reactive contract on Lasna subscribes only to specific emitters: the verifier registry, a third-party NFT collection's mints, and the vault's own lifecycle events. It keeps a deadline index synced from vault events and retries expiry until the vault acknowledges. It pays for cron only while a task is open. The vault authenticates every callback and re-checks its own rules, so duplicate, late or forged requests change nothing. Manual recovery exists for every path, so funds are never stuck if automation is down.

Every automated step is verifiable without a wallet. The `/proof` page and the Proof Center rebuild origin → Reactive → callback from chain data, and `pnpm verify:proofs` re-checks all four recorded loops (60 checks).

The app explains itself in plain words: before you sign, it lists every case the rule allows and where the money ends up. Afterwards, each task page tells the task's history as simple sentences, marks what Reactive Network did, and exports it as a CSV receipt.

**Links:**
- Live app: https://web-two-pied-ft7sms1616.vercel.app/
- Proof Center (no wallet needed): https://web-two-pied-ft7sms1616.vercel.app/proof
- Repository: https://github.com/Chima30/coftra
- Judge quickstart: https://github.com/Chima30/coftra/blob/main/docs/JUDGE_QUICKSTART.md
- Demo video: `<ADD LINK: under 3 minutes>`

**Deployed contracts** (all source-verified on Sourcify, exact match):

| Contract | Chain | Address |
|---|---|---|
| CoftraVault | Base Sepolia (84532) | 0x2335A6D769bb3f6E6D4B1a48f6926A81aEA5b719 |
| CoftraReactive | Reactive Lasna (5318007) | 0x17B29bC8400FB88de4c885Af4335983cd09c3D96 |
| CoftraMilestoneVerifier | Base Sepolia | 0x6AF465995710BA15db53D1a0F0867Ed4f38D3291 |
| CoftraMockUSDC (test token) | Base Sepolia | 0xa4da96908af4cd2cb4dAAde2359deB221B4F03D5 |
| CoftraDemoNFT (test collection) | Base Sepolia | 0x08643a27E03AEef33daBb629091Cf15730b2d4FD |

**Transaction hashes, full loop: origin → Reactive → callback:**

| Loop | Origin | Reactive (Lasna) | Callback (Base Sepolia) |
|---|---|---|---|
| CHECKPOINT | 0xd14aab0c1ba0d840139b1b6e0d97491e464581b0c3435ff5995876037f4560ce | 0xf584e835f25d1fd4e5d3d24c44ef8169248fd2245d676eff0427e94c1d13682c | 0x6c2d47492b3a67cfae829059840563e11816097fc562b3c14374a36109b42868 |
| CLOSEOUT (project) | 0x4330a5abe5a213614a0213510f666475028cbce361e499a3013ef53aed7d4846 | 0xae198bcdaae3c6b8e992f5607413cf0adb83a17081557987a84a6e7153552311 | 0xe917b2f438bdf9ebac2bf2a63cb85df473093a1fabe0d0c8a1217c29a28bc9ed |
| CLOSEOUT (session) | 0x0cb519ee7ed7a9894a790ce0a8c2cd34ac8e6fc6f738ba13d453173e0503f99f | 0x1c03e0d5b22b94df6008bd788f3988b71c84f4ff156418e3702304030c8deba4 | 0xd26d202b13f207173a73fff75a96c149370c5e12c89dee186add4eeb24b9c5fa |
| FALLBACK | 0x612b3e7c48e85f5ea33681fce1c6e8afb6555290929733a1423b909208a2b5e6 (Lasna cron) | 0x5c48cda6f98fd703c6b0562dca07def027df9be65f035826c70f8e59cb25fb49 | 0x00f052cdfd2f5f5e6eab4338610b1bef9702ef8ef8f833b57d85467761a0bf21 |

**Honest limitations:**
- Testnet only, and not independently audited.
- Verifiers are trusted for their own milestones; the owner has a clearly labelled override.
- Automation depends on funded reserves and Reactive availability, with manual recovery as a backstop.
- Sessions support one vetted target in this version.

---

## 3-minute video shot list

Record in this order. Every transaction shown should be one that has already confirmed; say on screen that these are recorded testnet runs.

| Time | Screen | Say (roughly) |
|---|---|---|
| 0:00–0:20 | Overview page | "Paying someone in stages, or letting a bot spend for you, normally means staying online to check, pay, revoke and refund. Coftra hands that to Reactive Network." |
| 0:20–0:45 | Create Automation → Conditional Project Budget → Review (Safety Preview) | "Budget, checkpoints, who verifies, the deadline. This preview is exactly what the vault enforces, including the owner override." |
| 0:45–1:10 | `/proof/checkpoint`: open the three hashes | "The verifier attests; about two seconds later Reactive's callback pays exactly 30, once." |
| 1:10–1:40 | `/proof/session-closeout` | "A bot could spend 25 on one mint. The NFT went to me; the session closed itself, the bot was revoked and 15 came back." |
| 1:40–2:05 | `/proof/fallback` | "Nobody acted. After the deadline a Reactive Cron tick expired the task, and the vault checked the time itself before refunding." |
| 2:05–2:30 | Automation Activity → one entry's full proof; Settings → Automation health | "Every step rebuilt from chain data. Funding, runway and recovery are shown honestly." |
| 2:30–3:00 | Terminal: `pnpm verify:proofs` → "All checks passed" | "60 checks re-verify all four loops from raw chain data. That's why it needs Reactive: outside events and time, with no keeper of my own." |
