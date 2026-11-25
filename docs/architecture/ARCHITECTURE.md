# Coftra architecture

## One lifecycle, three engines

Coftra has one task lifecycle. CHECKPOINT, CLOSEOUT and FALLBACK are not separate products; they are the three ways a task moves forward, all applied by the same vault through the same callback authentication.

```
                       createProjectTask / createSessionTask (owner signs, funds pulled)
                                          │
                                          ▼
          cancel (owner)            ┌──────────┐
   ┌────────────────────────────────│  Funded  │
   │                                └────┬─────┘
   │                                     │ activate (owner)  ──► emits TaskActivated
   │                                     ▼
   │     cancel (owner, sessions only) ┌──────────┐  CHECKPOINT: milestone released (stays Active)
   ├───────────────────────────────────│  Active  │◄─────────────┐
   ▼                                   └──┬────┬──┘──────────────┘
┌───────────┐       last milestone /       │    │   deadline reached (Reactive Cron
│ Cancelled │       paid-for mint observed │    │   or manual after +30 min)
└───────────┘       (CLOSEOUT)             ▼    ▼   (FALLBACK)
                                 ┌───────────┐ ┌─────────┐
                                 │ Completed │ │ Expired │
                                 └───────────┘ └─────────┘
       Completed, Expired and Cancelled are terminal. Every terminal transition goes through one
       internal function (_close) that revokes the executor, settles the remainder to refundTo,
       and emits Settled + TaskClosed.
```

Permitted transitions, all in `CoftraVault.sol`:

| From | To | Trigger | Who |
|---|---|---|---|
| — | Funded | `createProjectTask` / `createSessionTask` (activate=false) | anyone (becomes owner) |
| — / Funded | Active | create with activate=true, or `activate` | owner |
| Funded | Cancelled | `cancel` | owner |
| Active (session) | Cancelled | `cancel` | owner |
| Active | Active | milestone released (not the last) | Reactive callback or owner |
| Active | Completed | last milestone released | Reactive callback or owner |
| Active (session) | Completed | paid-for mint to beneficiary observed | Reactive callback only |
| Active | Expired | `onExpiryCheck` when `block.timestamp >= deadline` | Reactive callback |
| Active | Expired | `expire` when `block.timestamp >= deadline + 30 min` | anyone |

Milestone state (`done`) is tracked separately from task state. Callback outcomes are tracked separately again: every callback emits `ReactiveCallbackHandled(taskId, kind, originTxHash, originChainId, result)`, so a request that was received but not applied is visible with its reason instead of being silently dropped. A callback request never changes task state by itself; only the vault decides.

## Contracts

| Contract | Chain | Role |
|---|---|---|
| `CoftraVault` | Base Sepolia | Tasks, per-task accounting, spending sessions, lifecycle, callback receiver (`AbstractCallback`). The authority for every state change. |
| `CoftraReactive` | Reactive Lasna | Reactive contract (`AbstractReactive`). Narrow subscriptions; turns events into callback requests. Holds no user funds and no rules. |
| `CoftraMilestoneVerifier` | Base Sepolia | Public attestation registry. Records `msg.sender` as the verifier and pre-checks with the vault when on the same chain. |
| `CoftraMockUSDC` | Base Sepolia | Test token, no value. |
| `CoftraDemoNFT` | Base Sepolia | Controlled collection for the spending-session demo. |

The suggested split into separate TaskManager / Vault / Callback / SessionExecutor contracts was consolidated into `CoftraVault`. Separating them would add cross-contract calls and a second authorization boundary around the same storage, with no security benefit at this size.

## Reactive integration

`CoftraReactive` subscriptions (all with a specific contract address, so cost is bounded):

| Subscription | Origin | Purpose |
|---|---|---|
| `MilestoneVerified(uint256,uint256,address,uint64)` on the registry | Base Sepolia | CHECKPOINT |
| ERC-721 `Transfer` with `topic1 == 0` (mints) on each watched collection | Base Sepolia | CLOSEOUT |
| `TaskActivated`, `DeadlineExtended`, `TaskClosed` on the vault | Base Sepolia | Keeps a local index of open deadlines |
| Cron (`Cron100` for the demo, `Cron1000` otherwise) on `0x…fffFfF` | Lasna | FALLBACK; subscribed only while at least one task is open |

### Why the reactive contract keeps a deadline index

A reactive contract cannot read Base Sepolia storage. The FALLBACK engine needs to know which tasks have passed their deadline, so `CoftraReactive` rebuilds that set from the vault's own events. This is the configuration synchronization scheme:

- **Source of truth.** The vault is authoritative. The RC's index is a cache that can only cause a wasted callback, never a wrong transition, because `onExpiryCheck` re-checks `state == Active && block.timestamp >= deadline` on the destination.
- **Ordering and versioning.** `DeadlineExtended` carries the new deadline and the incremented `configVersion`; the RC overwrites its entry. Milestone attestations carry the `configVersion` the verifier reviewed, and the vault rejects mismatches as `StaleConfig`.
- **Acknowledgement instead of retries.** Reactive Network does not retry failed callbacks. The RC keeps an overdue task and re-requests it every `retryInterval` (5 min) until it observes the vault's `TaskClosed`. If the RC missed a `TaskClosed`, the next expiry check on a closed task re-emits `TaskClosed` (`AlreadyApplied`), which clears it.
- **Cost.** When the index becomes empty, the RC unsubscribes from cron. It resubscribes when the next task activates.

### Callback authentication

Every callback function is guarded by `onlyServiceProvider` (`msg.sender` must be the Base Sepolia callback proxy `0x476F…3585`) and `onlyCallbackSender(rvmId)` (the first argument, which Reactive Network overwrites with the requesting RC's address, must equal the immutable `_CALLBACK_SENDER`). On the RC side, `react()` is `onlySystem`, and each subscription is pinned to a specific emitter, so an event with the right signature from another contract is never relayed (`test_auth_forgedEventFromOtherEmitterIsIgnored`).

### Proof of execution

Each payload carries the origin `chainId` and `txHash` from the `LogRecord`. The RC emits `CallbackRequested(kind, subject, originTxHash, originChainId)` on Lasna, and the vault emits `ReactiveCallbackHandled(..., originTxHash, ...)` on Base Sepolia. The Proof Center joins the two on `originTxHash`, so origin tx → reactive tx → destination tx is rebuilt from chain logs alone, with no indexer.

## Spending sessions

The permitted call is `target.selector(beneficiary, …)`. The vault checks the selector and that the first ABI word equals the beneficiary, approves exactly `maxSpend`, makes the call, resets the approval to zero, and books only the measured balance decrease. Targets equal to the token, the vault or the proxy are rejected, as are `approve`, `transfer`, `transferFrom` and `setApprovalForAll` selectors. There is no delegatecall. Cap and deadline are checked on every call, so a delayed CLOSEOUT callback can never extend the executor's authority (`test_session_delayedCallbackCannotExceedCap`).

CLOSEOUT for a session needs all of the following:
1. A mint observed from a watched collection.
2. An active session for that (collection, beneficiary) pair. Only one is allowed at a time.
3. At least one execution by the session.
4. `ownerOf(tokenId) == beneficiary` on the destination.

## Accounting

- Per task: `deposited`, `released` (paid out or spent), `refunded`. Available = deposited − released − refunded.
- Per token: `totalLiabilities` = Σ available over tasks + Σ credits. The raw vault balance is never used for accounting, so unsolicited transfers change nothing (`test_unsolicitedTransferDoesNotChangeCredits`).
- Deposits measure the actual balance delta, so fee-on-transfer tokens revert. Tokens are allow-listed by the admin; rebasing tokens are out of scope and must not be allow-listed.
- Pay-or-credit: if a payout transfer fails, the amount moves to `credits[token][to]` and the transition still completes. A callback must never revert for business reasons, since it will not be retried.

## Frontend

Next.js 16 (App Router, Cache Components), wagmi/viem, TanStack Query. All task data comes from contract reads and logs:

- Tasks: `tasksOf`, `tasksInvolving`, then one `multicall` per task. Open tasks you verify are found from the vault's `TaskActivated` / `TaskClosed` logs, because the vault doesn't index verifiers.
- History: chunked `getLogs` on the vault from its deployment block. Task pages turn those events into plain sentences and a CSV receipt (`lib/story.ts`).
- Proofs: receipts on both chains plus the RC's `CallbackRequested` logs.
- Funding: native balances, `debt()` on the system contract and the callback proxy, gas prices.
- Pop-ups: while a wallet with tasks is connected, new vault events are read in small block ranges, starting at the block current when the watcher starts, so nothing from the past is announced (`components/reactive-toasts.tsx`, `lib/toasts.ts`).
- Transactions: the Rule Builder's contract arguments come from pure functions (`lib/tx-builders.ts`). The WHEN / THEN / OTHERWISE diagram, the safety inspector and "What will happen" are built from the same input.

There is no backend. Browser storage (`localStorage`) holds conveniences only, none of them authoritative: the colour theme, a journal of submitted transaction hashes (reconciled against receipts), private task names, contacts, saved templates, and whether the first-run guide was dismissed. They stay on the device, are never sent anywhere, and are parsed defensively when read: anything malformed is dropped. A saved template only pre-fills the Rule Builder, where every value is validated and shown again before signing.
