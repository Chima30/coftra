/** Mirrors the Solidity enums in ICoftraVault.sol, with plain-language copy for the UI. */

export enum TaskKind {
  ProjectBudget = 0,
  SpendingSession = 1,
}

export enum TaskState {
  None = 0,
  Funded = 1,
  Active = 2,
  Completed = 3,
  Expired = 4,
  Cancelled = 5,
}

export enum CallbackKind {
  Milestone = 0,
  Outcome = 1,
  Expiry = 2,
}

export enum CallbackResult {
  Applied = 0,
  AlreadyApplied,
  UnknownTask,
  InvalidState,
  InvalidMilestone,
  WrongVerifier,
  StaleConfig,
  PastDeadline,
  NotYetDue,
  NoSessionForOutcome,
  NoExecutionYet,
  OutcomeUnverified,
}

export const kindLabel: Record<TaskKind, string> = {
  [TaskKind.ProjectBudget]: "Conditional Project Budget",
  [TaskKind.SpendingSession]: "Temporary Spending Session",
};

export const stateCopy: Record<TaskState, { label: string; hint: string; tone: Tone }> = {
  [TaskState.None]: { label: "Unknown", hint: "No task with this id.", tone: "neutral" },
  [TaskState.Funded]: { label: "Funded", hint: "Funds are deposited. Automation starts when you activate.", tone: "info" },
  [TaskState.Active]: { label: "Active", hint: "Reactive Network is watching for outcomes and the deadline.", tone: "accent" },
  [TaskState.Completed]: { label: "Completed", hint: "All conditions met. Leftover funds were returned.", tone: "success" },
  [TaskState.Expired]: { label: "Expired", hint: "Deadline passed. Completed payouts stand; the rest was returned.", tone: "warning" },
  [TaskState.Cancelled]: { label: "Cancelled", hint: "Cancelled by the owner. Unspent funds were returned.", tone: "neutral" },
};

export const callbackKindLabel: Record<CallbackKind, string> = {
  [CallbackKind.Milestone]: "CHECKPOINT",
  [CallbackKind.Outcome]: "CLOSEOUT",
  [CallbackKind.Expiry]: "FALLBACK",
};

export const callbackResultCopy: Record<CallbackResult, { label: string; explain: string; ok: boolean }> = {
  [CallbackResult.Applied]: { label: "Applied", explain: "The vault re-checked the rule and applied the change.", ok: true },
  [CallbackResult.AlreadyApplied]: { label: "Already applied", explain: "Duplicate delivery. Nothing changed, by design.", ok: true },
  [CallbackResult.UnknownTask]: { label: "Unknown task", explain: "The vault has no task with this id.", ok: false },
  [CallbackResult.InvalidState]: { label: "Not active", explain: "The task was not active when the callback arrived.", ok: false },
  [CallbackResult.InvalidMilestone]: { label: "Invalid milestone", explain: "That milestone does not exist on this task.", ok: false },
  [CallbackResult.WrongVerifier]: { label: "Wrong verifier", explain: "The attestation came from someone other than the named verifier.", ok: false },
  [CallbackResult.StaleConfig]: { label: "Stale configuration", explain: "The task changed after the verifier reviewed it.", ok: false },
  [CallbackResult.PastDeadline]: { label: "Too late", explain: "The callback arrived after the deadline on the destination chain.", ok: false },
  [CallbackResult.NotYetDue]: { label: "Not yet due", explain: "The deadline has not passed on the destination chain yet. It will be retried.", ok: false },
  [CallbackResult.NoSessionForOutcome]: { label: "No matching session", explain: "No active session expected this outcome.", ok: false },
  [CallbackResult.NoExecutionYet]: { label: "Not paid by session", explain: "The session hasn't spent anything yet, so this mint doesn't close it.", ok: false },
  [CallbackResult.OutcomeUnverified]: { label: "Outcome not confirmed", explain: "The vault could not confirm the beneficiary owns the token.", ok: false },
};

export type Tone = "neutral" | "info" | "accent" | "success" | "warning" | "danger";

export const isTerminal = (s: TaskState) =>
  s === TaskState.Completed || s === TaskState.Expired || s === TaskState.Cancelled;
