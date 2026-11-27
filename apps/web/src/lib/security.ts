/**
 * Attacks Coftra has been tested against and what stops each one. Every entry names real Foundry tests
 * (security.test.ts fails if a named test doesn't exist in contracts/test), and some also cite what was
 * checked on testnet in the recorded runs. Nothing here is a claim without a test behind it.
 */

export type TestRef = { name: string; file: "CoftraLifecycle.t.sol" | "CoftraFuzz.t.sol" };
export type Defence = {
  attack: string;
  stoppedBy: string;
  how: string;
  tests: TestRef[];
  /** Observed on testnet in the recorded runs (see the Proof Center), when there is something to observe. */
  onTestnet?: string;
};

const L = (name: string): TestRef => ({ name, file: "CoftraLifecycle.t.sol" });
const F = (name: string): TestRef => ({ name, file: "CoftraFuzz.t.sol" });

export const DEFENCES: Defence[] = [
  {
    attack: "Send the vault a fake callback to trigger a payout",
    stoppedBy: "Vault: callback sender check",
    how: "Callback functions only accept calls from Reactive's callback proxy (onlyServiceProvider). Anyone else is rejected.",
    tests: [L("test_auth_rejectsCallerOtherThanProxy")],
    onTestnet: "All four recorded callbacks arrived through the callback proxy 0x476F…3585; Verify a task checks this for any task.",
  },
  {
    attack: "Use a different reactive contract to call the vault",
    stoppedBy: "Vault: reactive contract check",
    how: "Reactive Network writes the requesting contract into every callback; the vault only accepts Coftra's own reactive contract (onlyCallbackSender).",
    tests: [L("test_auth_rejectsOtherReactiveContract")],
  },
  {
    attack: "Emit look-alike events from another contract",
    stoppedBy: "Reactive contract: emitter filter",
    how: "The reactive contract only reacts to events from the verifier registry, the vault and the demo NFT it was set up with, delivered by the Reactive system.",
    tests: [L("test_auth_forgedEventFromOtherEmitterIsIgnored"), L("test_auth_reactOnlyFromSystem")],
  },
  {
    attack: "Confirm a checkpoint without being its verifier, or against an outdated rule",
    stoppedBy: "Registry, then the vault re-checks",
    how: "The registry only accepts the named verifier for the current configuration, and the vault re-checks the attestation itself even if the registry were bypassed.",
    tests: [L("test_checkpoint_registryRejectsWrongVerifierAndStaleConfig"), L("test_checkpoint_vaultRevalidatesEvenIfRegistryIsBypassed"), L("test_sr2_attestationCooldown")],
    onTestnet: "After task 2 expired, a late attestation was rejected by the registry (NotAttestable).",
  },
  {
    attack: "Get a checkpoint paid twice",
    stoppedBy: "Vault: paid-once flag",
    how: "Each checkpoint is marked paid in the same step that pays it; duplicate or replayed callbacks change nothing.",
    tests: [L("test_checkpoint_duplicateEventIsIdempotent"), F("testFuzz_randomMilestoneCallbacks")],
  },
  {
    attack: "Let a session bot spend more, or on something else",
    stoppedBy: "Vault: local limits on every call",
    how: "One target, one function, the owner as beneficiary, a hard cap and the deadline are checked at call time; approvals are exact and reset to zero.",
    tests: [L("test_session_localLimitsEnforced"), L("test_session_rejectsDangerousConfig"), L("test_sr1_sessionBeneficiaryMustBeOwner"), F("testFuzz_sessionSpendBounded")],
    onTestnet: "After task 3 closed, a second spend by its bot reverted with WrongState(3) (checked with a read-only call).",
  },
  {
    attack: "Use a late callback to extend a session past its cap or close",
    stoppedBy: "Vault: state and limits re-checked",
    how: "A delayed callback can never raise the cap, reopen a closed task or move funds after it closed.",
    tests: [L("test_session_delayedCallbackCannotExceedCap"), L("test_lateCallbacksAfterCloseChangeNothing"), L("test_closeout_mintNotPaidBySessionDoesNotClose")],
  },
  {
    attack: "Expire a task early to grab the refund",
    stoppedBy: "Vault: its own clock",
    how: "The vault only expires a task when its own chain time is past the deadline; early requests are refused as not yet due.",
    tests: [L("test_fallback_vaultIgnoresEarlyExpiryRequest"), F("testFuzz_deadlineBoundary")],
  },
  {
    attack: "Race completion against expiry to be paid twice",
    stoppedBy: "Vault: one final state",
    how: "Whichever arrives first closes the task; the other changes nothing.",
    tests: [L("test_fallback_completionAndExpiryRaceResolvesOnce")],
  },
  {
    attack: "Have the admin take users' funds",
    stoppedBy: "Vault: no admin path to task balances",
    how: "The owner of the vault can only allow tokens, pause new tasks and withdraw the native coin kept for callback fees.",
    tests: [L("test_adminCannotTouchUserFunds")],
  },
  {
    attack: "Drain one task's money through another",
    stoppedBy: "Vault: per-task accounting",
    how: "Each task's balance is tracked on its own, and the vault's totals always add up.",
    tests: [L("test_crossTaskIsolation"), F("testFuzz_projectConservation")],
  },
  {
    attack: "Break the books with token tricks",
    stoppedBy: "Vault: token checks and credits",
    how: "Fee-on-transfer tokens are refused, tokens sent in uninvited don't count, and a payout the token blocks is kept as a credit to claim once.",
    tests: [L("test_feeOnTransferTokenRejected"), L("test_unsolicitedTransferDoesNotChangeCredits"), L("test_failedPayoutIsCreditedAndClaimableOnce")],
  },
  {
    attack: "Back out of a project budget once the work has started",
    stoppedBy: "Vault: cancellation rule",
    how: "A project budget can only be cancelled before activation; after that it's a commitment to the recipient until the deadline.",
    tests: [L("test_projectCannotBeCancelledOnceActive_butCanWhileFunded")],
  },
  {
    attack: "Leave funds stuck when automation is down",
    stoppedBy: "Retries, then the manual fallback",
    how: "Expiry checks are re-requested until the vault confirms, and 30 minutes after the deadline anyone can run the same fallback by hand.",
    tests: [L("test_fallback_retriesAfterIntervalUntilVaultAcks"), L("test_fallback_manualRecoveryWhenAutomationIsDown")],
  },
];

export const testUrl = (t: TestRef) => `https://github.com/Chima30/coftra/blob/main/contracts/test/${t.file}`;
