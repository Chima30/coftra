# How Coftra differs

Coftra is not the first automation, escrow or spending-permission tool, and doesn't claim to be. This note sets out where it overlaps with other Reactive projects and what it does differently. Every difference points to working code.

## What we compared against

These are the public project summaries on the [Reactive Omni Buildathon builds page](https://dorahacks.io/hackathon/reactive-omni-buildathon/buidl), read 2026-11-18. We read their one-line descriptions, not their code, so the comparison is about stated scope only.

| Theme in other entries | Examples (as described publicly) | Overlap with Coftra |
|---|---|---|
| Recurring or split payments | BillPilot, AutoPay Vault, AllowanceBot, Payday Split | Both move funds automatically from a vault. Theirs are triggered by deposits or a schedule; Coftra's payouts are triggered by a verified outcome |
| Price-triggered exits | Stop-Loss Sentinel, ExitGuard, Reflex, Ripcord, Tripwire | Event-driven callbacks with no keeper. Different trigger (price) and purpose (trading) |
| Protective sweeps and revocations | AutoGuard, Latchkey | Revoking or moving authority automatically. Coftra revokes a permission because the job is done, not because a threat was detected |
| Authorized agent payments | Verigate | Both gate execution on authorization. Coftra additionally caps spend, pins the beneficiary, and closes and refunds on the outcome |

## What Coftra does differently

1. **One lifecycle with three exits, not one trigger.**
   - Each task is `Active → Completed | Expired | Cancelled`. CHECKPOINT moves it forward; CLOSEOUT finishes it when the outcome happens; FALLBACK finishes it when the deadline wins.
   - All three go through one exit function (`CoftraVault._close`) that revokes authority and settles the remainder.
   - Code: `CoftraVault.sol` `_close`, `onMilestoneVerified`, `onOutcome`, `onExpiryCheck`.

2. **Outcomes observed on contracts Coftra doesn't control.**
   - CLOSEOUT for a spending session fires on an ERC-721 mint by an independent collection. The reactive contract subscribes to that collection's mint-only filter (`topic1 == 0`).
   - The vault then confirms `ownerOf(tokenId) == beneficiary` and that the session actually paid.
   - Code: `CoftraReactive._subCollection`, `CoftraVault.onOutcome`. Proven on-chain: task 3.

3. **Temporary spending authority that ends itself.**
   - A session grants a bot one target, one function and a hard cap, with the beneficiary pinned in the calldata and an exact approval reset to zero after every call.
   - The authority is revoked automatically when the paid-for outcome is seen, or at the deadline.
   - Code: `CoftraVault.executeSession`. Tests: `test_session_*`.

4. **Residual-fund recovery as a first-class outcome.**
   - Reserves and unspent caps return to the owner on completion, expiry or cancellation.
   - Completed payouts are never clawed back.
   - Proven on-chain: 20 tUSDC reserve (task 1), 15 tUSDC unspent (task 3), 20 tUSDC on expiry (task 2).

5. **Deadline enforcement driven by the destination's own events.**
   - The reactive contract builds its deadline index from the vault's `TaskActivated` / `DeadlineExtended` / `TaskClosed` events.
   - It retries expiry until the vault acknowledges, and only subscribes to cron while something is open.
   - Code: `CoftraReactive._track`, `_untrack`, `_onCron`. Proven on-chain: cron switched off after task 1 closed.

6. **Verifiable without trusting the website.**
   - The Proof Center and `/proof` rebuild every loop from chain logs.
   - The reactive contract records `originTxHash` on Lasna, and the vault records it on Base Sepolia.
   - Code: `apps/web/src/lib/proof.ts`.

## Where Coftra is weaker

- Verifiers are trusted parties. There's no k-of-n attestation yet.
- Sessions support a single vetted target in this version. A general allow-list is future work.
- Latency is ~1–3 s, which suits personal automation. Coftra doesn't compete on sub-second trading.
