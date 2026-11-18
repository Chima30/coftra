# Failure and recovery evidence

Each row says where the evidence comes from:
- **On-chain:** observed on Base Sepolia / Lasna with the deployed contracts.
- **On-chain (read-only):** an `eth_call` simulation against live state; no transaction was sent.
- **Local test:** a Foundry test in `contracts/test`, run against a local model of Reactive Network (`test/utils/MockSystem.sol` + `CoftraFixture.sol`). It shows the contract logic, not network behaviour.

Run every local test with:

```bash
cd contracts && forge test
```

| Scenario | Expected behaviour | Evidence | Where |
|---|---|---|---|
| The same milestone event delivered twice | Paid exactly once; second delivery recorded as `AlreadyApplied` | `test_checkpoint_duplicateEventIsIdempotent` | Local test |
| Callback not sent by the Reactive callback proxy | Reverts `NotAuthorized` | `test_auth_rejectsCallerOtherThanProxy` | Local test |
| Callback from a different reactive contract | Reverts `CallbackNotAuthorized` | `test_auth_rejectsOtherReactiveContract` | Local test |
| Look-alike event from an unauthorized contract | No callback is ever requested | `test_auth_forgedEventFromOtherEmitterIsIgnored` | Local test |
| Wrong verifier or stale configuration | No payout; recorded `WrongVerifier` / `StaleConfig` | `test_checkpoint_vaultRevalidatesEvenIfRegistryIsBypassed`, `test_checkpoint_registryRejectsWrongVerifierAndStaleConfig` | Local test |
| Executor spends after the deadline, over the cap, or calls anything else | Reverts `DeadlinePassed` / `SpendLimitExceeded` / `SessionCallRejected` | `test_session_localLimitsEnforced`, `test_session_delayedCallbackCannotExceedCap` | Local test |
| Executor spends after the session closed | Reverts `WrongState(3)` | Task 3 after its CLOSEOUT | On-chain (read-only) |
| Callbacks that arrive after a task is final | No funds move, nothing reopens, nothing reverts | `test_lateCallbacksAfterCloseChangeNothing` | Local test |
| Completion and expiry race | Destination time decides; settled once | `test_fallback_completionAndExpiryRaceResolvesOnce` | Local test |
| Missed deadline | Expired by Reactive Cron; unspent funds refunded | Task 2 (see JUDGE_QUICKSTART) | On-chain |
| Expiry callback lost or undelivered | Reactive contract re-requests every `retryInterval` until the vault's `TaskClosed` | `test_fallback_retriesAfterIntervalUntilVaultAcks` | Local test |
| Expiry requested before the deadline (clock skew) | Vault refuses (`NotYetDue`) | `test_fallback_vaultIgnoresEarlyExpiryRequest` | Local test |
| Automation unavailable entirely | Anyone can call `expire` 30 min after the deadline | `test_fallback_manualRecoveryWhenAutomationIsDown` | Local test |
| Recipient's token transfer fails | Transition completes; amount kept as claimable credit; claimable once | `test_failedPayoutIsCreditedAndClaimableOnce` | Local test |
| Reactive execution reserve running low | Reactions billed from reserves; contract balance is not billed | Reserves fell 0.5 → 0.085 lREACT in 52.9 min (measured from archive state) while cron ran; topped up with `Step5_BalanceToReserves` | On-chain |
| Insufficient callback funding on Base | Proxy debt blocks callbacks; funds stay in the vault; manual paths still work | Not exercised on-chain. Funding Health shows proxy debt; manual `expire` and owner override need no callback | Not tested |
| Callback delayed beyond the deadline | Late milestone callbacks rejected (`PastDeadline`); the task then expires once | `test_fallback_completionAndExpiryRaceResolvesOnce` | Local test |
| Attestation after the task expired | Registry refuses (`NotAttestable`); a forced callback is recorded `InvalidState` | `test_fallback_cronExpiresOverdueTaskAndPreservesPaidMilestones` | Local test |
| Claiming a credit twice | Second claim reverts `NothingToClaim` | `test_failedPayoutIsCreditedAndClaimableOnce` | Local test |
| Every one of the four recorded loops | Origin, Reactive request, proxy delivery, origin link in the callback, token movements and final state | `cd apps/web && pnpm verify:proofs` (58 checks against live receipts and state) | On-chain (read-only re-verification) |
| Wallet cancels or replaces a pending transaction | The app reports it as cancelled or replaced, never "Confirmed" | `onReplaced` handling in `apps/web/src/hooks/use-tx.ts` | Code review; manual browser test pending (WALLET_TEST X2) |
| Wallet on the wrong network | Write actions refuse with "switch to Base Sepolia"; nothing sent to another chain | `chainId` pinned on every write in `use-tx.ts` | Code review; manual browser test pending (WALLET_TEST A5) |
| Browser closed during a transaction | State rebuilt from the chain on reopen; recent hashes reconciled with receipts | Settings → "Transactions sent from this browser" | Manual browser test pending (WALLET_TEST X3) |
| RPC outage while loading | Funding shows "Unknown"; proofs show "couldn't re-check"; nothing shown as healthy or verified | `funding.tsx`, `verified.tsx` | Code review; not fault-injected |

## Safe recovery of unspent funds

Every terminal transition goes through `CoftraVault._close`, which revokes any executor, computes the remainder from per-task accounting (never the raw vault balance) and pays it to the task's `refundTo` address, or credits it if the transfer fails. The invariant suite checks across thousands of random action sequences that:
- a closed task has zero available balance;
- `released + refunded == deposited`;
- total liabilities always equal open balances plus credits.
