import { fmtDate, fmtToken, relTime, shortHex } from "./format";
import type { HealthLevel } from "./funding";
import { CallbackResult, TaskKind, TaskState, type Tone } from "./protocol";
import type { TaskLike } from "./roles";

/**
 * Task Health: a plain status for each task, computed only from the vault's state, the task's callback results
 * and the automation funding reading. Nothing is scored or estimated; when an input can't be read the result says so.
 */

export const MANUAL_RECOVERY_SECONDS = 30 * 60; // CoftraVault.MANUAL_RECOVERY_DELAY
const DAY = 86_400;

export type HealthLabel =
  | "Healthy"
  | "Attention needed"
  | "Expiring soon"
  | "Recovery available"
  | "Funding warning"
  | "Completed"
  | "Expired"
  | "Cancelled"
  | "Status unknown";

export type TaskHealth = { label: HealthLabel; tone: Tone; reasons: string[] };

export type HealthInputs = {
  /** Unix seconds, from the browser clock. 0 means not known yet. */
  now: number;
  /** Automation funding, or undefined when it couldn't be read. */
  funding?: { reactive: HealthLevel; callbacks: HealthLevel };
  /** Results of every callback the vault handled for this task (undefined when logs couldn't be read). */
  callbacks?: CallbackResult[];
};

export const HEALTH_TONE: Record<HealthLabel, Tone> = {
  Healthy: "success",
  "Attention needed": "warning",
  "Expiring soon": "warning",
  "Recovery available": "danger",
  "Funding warning": "danger",
  Completed: "success",
  Expired: "neutral",
  Cancelled: "neutral",
  "Status unknown": "neutral",
};
const make = (label: HealthLabel, reasons: string[]): TaskHealth => ({ label, tone: HEALTH_TONE[label], reasons });

/** Callback results that mean the vault refused a request (not counting harmless ones like "not yet due"). */
export const refusedCallbacks = (results: CallbackResult[]) =>
  results.filter((r) => r !== CallbackResult.Applied && r !== CallbackResult.AlreadyApplied && r !== CallbackResult.NotYetDue).length;

export function taskHealth(t: TaskLike, { now, funding, callbacks }: HealthInputs): TaskHealth {
  const state = t.task.state as TaskState;
  if (state === TaskState.Completed) return make("Completed", ["Every rule was met; anything left over was returned when it closed."]);
  if (state === TaskState.Expired) return make("Expired", ["The deadline passed; payouts already made stand and the rest went to the refund address."]);
  if (state === TaskState.Cancelled) return make("Cancelled", ["Cancelled by the owner; the deposit went back to the refund address."]);
  if (state === TaskState.None) return make("Status unknown", ["No task with this id in the vault."]);
  if (!now) return make("Status unknown", ["Waiting for the clock."]);

  if (state === TaskState.Funded)
    return make("Attention needed", ["Funded but not switched on, so Reactive Network isn't watching it yet. The owner can activate it, or cancel to get the deposit back."]);

  // Active from here on.
  const deadline = Number(t.task.deadline);
  const reasons: string[] = [];
  const refused = callbacks ? refusedCallbacks(callbacks) : 0;

  if (now >= deadline + MANUAL_RECOVERY_SECONDS)
    return make("Recovery available", [
      `The deadline passed ${relTime(deadline, now)} and automatic expiry hasn't landed yet.`,
      "Anyone can now run the fallback by hand from the task page: unspent funds go to the refund address and payouts already made stand.",
    ]);
  if (now >= deadline)
    return make("Expiring soon", [
      `The deadline passed ${relTime(deadline, now)}. Reactive Network normally expires the task within a few minutes.`,
      `If it hasn't by ${fmtDate(deadline + MANUAL_RECOVERY_SECONDS)}, anyone can run the fallback by hand.`,
    ]);

  if (funding && (funding.reactive === "blocked" || funding.callbacks === "blocked"))
    return make("Funding warning", [
      "Automation funding is in debt or paused, so Reactive Network can't act on this task until someone tops it up.",
      "Funds stay safe in the vault, and the manual fallback still works 30 minutes after the deadline.",
    ]);
  if (refused > 0)
    return make("Attention needed", [
      `${refused} callback${refused > 1 ? "s were" : " was"} refused by the vault for this task (for example a wrong verifier or a stale configuration). See Reactive proofs on the task page.`,
    ]);
  if (deadline - now < DAY) reasons.push(`Deadline ${relTime(deadline, now)} (${fmtDate(deadline)}).`);

  if (t.task.kind === TaskKind.ProjectBudget) {
    const next = t.milestones.findIndex((m) => !m.done);
    if (next >= 0) reasons.push(`Waiting for ${shortHex(t.milestones[next].verifier)} to confirm checkpoint ${next + 1} (${fmtToken(t.milestones[next].amount)}).`);
  } else {
    const left = t.session.spendCap - t.session.spent;
    reasons.push(`The executor can still spend ${fmtToken(left)} of ${fmtToken(t.session.spendCap)}; the session closes when its outcome arrives.`);
  }
  if (funding?.reactive === "low" || funding?.callbacks === "low") reasons.push("Automation funding is running low; see Settings → Automation health.");

  if (deadline - now < DAY) return make("Expiring soon", reasons);
  if (!funding) return make("Status unknown", ["Automation funding couldn't be read right now, so it isn't certain Reactive Network can act.", ...reasons]);
  return make("Healthy", reasons.length ? reasons : ["Reactive Network is watching this task."]);
}

export type HealthTotals = {
  open: number;
  allocated: bigint;
  reserved: bigint;
  available: bigint;
  byLabel: Partial<Record<HealthLabel, number>>;
  nextDeadlines: { id: bigint; deadline: number }[];
};

/** Totals for the Overview, for tasks the viewer owns. Amounts are tUSDC (the only token the vault accepts today). */
export function healthTotals(tasks: (TaskLike & { available: bigint; reserved: bigint })[], health: Map<bigint, TaskHealth>): HealthTotals {
  const open = tasks.filter((t) => t.task.state === TaskState.Active || t.task.state === TaskState.Funded);
  const byLabel: Partial<Record<HealthLabel, number>> = {};
  for (const t of tasks) {
    const h = health.get(t.id);
    if (h) byLabel[h.label] = (byLabel[h.label] ?? 0) + 1;
  }
  return {
    open: open.length,
    allocated: open.reduce((s, t) => s + t.task.deposited - t.task.released - t.task.refunded, 0n),
    reserved: open.reduce((s, t) => s + t.reserved, 0n),
    available: open.reduce((s, t) => s + t.available, 0n),
    byLabel,
    nextDeadlines: open
      .map((t) => ({ id: t.id, deadline: Number(t.task.deadline) }))
      .sort((a, b) => a.deadline - b.deadline)
      .slice(0, 3),
  };
}
