# Task Health, spending policy and recovery

These screens borrow three ideas from the Buffer project: a health view of everything you've committed, a plain spending-policy summary, and independent verification. They are adapted to what Coftra's deployed contracts actually enforce. Buffer's agents, approval engine and server components were not brought over. Nothing here changes the contracts, the ABIs, the addresses or the four recorded proofs.

## Task Health (`apps/web/src/lib/health.ts`)

**Where it shows:**
- every task page, in the "Task health" card
- every task row, as a badge
- the Overview, in a "Task health" summary that replaced the old four-number strip

It is computed in the browser from three inputs only:

1. **The vault's state for the task**: state, deadline, checkpoints, session cap and spend.
2. **The task's callback results**: `ReactiveCallbackHandled` events in the vault's logs.
3. **The automation funding reading** from the existing Funding Health code (`lib/funding.ts`).

| Status | When |
| --- | --- |
| Completed / Expired / Cancelled | The vault's final state |
| Attention needed | Funded but not activated (nobody is watching it yet), or the vault refused a callback for this task (wrong verifier, stale configuration and so on). "Not yet due" and duplicate deliveries don't count |
| Recovery available | Active, more than 30 minutes past the deadline: anyone can run the fallback by hand |
| Expiring soon | Active and the deadline is within a day, or passed less than 30 minutes ago |
| Funding warning | The reactive contract or the vault's callback balance is in debt or paused |
| Status unknown | An input couldn't be read (for example the funding reading); it never guesses |
| Healthy | None of the above, with funding readable |

Each status lists its reasons, such as "Waiting for 0x8FCF…810f to confirm checkpoint 2 (50 tUSDC)", and shows the time the data was read from the chains. If a refresh fails while older data is on screen, pages now keep that data and show "Couldn't refresh from the chain" with the time it was read, instead of an error page.

## Spending policy (task page)

The "Spending policy" card shows the task's limits exactly as the vault stores them:
- **Project budget:** budget, each checkpoint with its verifier and whether it's paid, the reserve, and the authorised recipient.
- **Session:** cap and what's left, the executor, and the permitted call and target.
- **Both:** deadline, refund destination, cancellation rule, owner and config version.

Every line is enforced by `CoftraVault`. No limits are added in the app, and none can be edited there.

## Who can move funds

The same card lists every role that can move a task's funds, as the contract allows:

| Who | Project budget | Spending session | Signature |
| --- | --- | --- | --- |
| Reactive Network (automatic) | CHECKPOINT payment after a verifier's attestation; CLOSEOUT when the last one is paid; FALLBACK after the deadline | CLOSEOUT when the outcome reaches the beneficiary; FALLBACK | None from anyone involved; the vault re-checks every callback |
| Verifier | Confirms a checkpoint; can't change amount, recipient or deadline | — | The verifier |
| Owner (manual) | `ownerReleaseMilestone`: pays a checkpoint's fixed amount to the set recipient, before the deadline, without the verifier; `extendDeadline` (verifiers re-attest); `cancel` only before activation | `cancel` at any time (returns the unspent amount, revokes the executor); `extendDeadline` | The owner |
| Executor | — | `executeSession`: one target, one function, up to the cap, before the deadline; approvals reset to zero | The executor |
| Anyone | `expire` 30 minutes after the deadline | same | Whoever runs it |
| Any address owed funds | `claim` a payout the token blocked | same | That address |

Project budgets also show this note: payments are normally released after the named verifier attests, and the owner can also release a checkpoint directly.

## Recovery and consequential actions

These actions now open a confirmation first. It says who may run the action, which funds move, whether it can be undone, what happens to payouts already made, and that the wallet will ask for a signature:
- Cancel
- Run fallback manually
- Extend deadline
- Owner override (it already had a confirmation)

There is no pause or freeze for tasks in the deployed vault, so none is shown. The owner's only admin levers are `setTokenAllowed`, `setCreationPaused` (new tasks only) and `withdrawCallbackFunds` (native coin for callback fees). None of them can touch task balances.

## Proof Center

Each recorded run now also states:
- what triggered it
- the task's final state
- the contracts that took part, with their addresses and explorer links

This sits alongside the existing five stages, the live receipt re-check, asset movements and shareable `/proof/<id>` links. All values come from the same recorded evidence; no hashes changed.

## Not in this release (would need new contracts)

- Requiring several approvals before a payout (k-of-n verifiers or multisig).
- A real emergency pause for active tasks, or freezing a single task.
- Policy limits beyond those listed above, such as per-period spending limits or allow-lists of several targets.
- Health history over time. That would need storage or a server; the app stays server-free.
