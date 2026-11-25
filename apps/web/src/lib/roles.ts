import { fmtDate, fmtToken, shortHex } from "./format";
import { TaskKind, TaskState } from "./protocol";

/** Minimal shape of a task as read from the vault (see lib/reads.ts). */
export type TaskLike = {
  id: bigint;
  task: {
    owner: string;
    kind: number;
    state: number;
    deadline: bigint;
    recipient: string;
    refundTo: string;
    deposited: bigint;
    released: bigint;
    refunded: bigint;
  };
  milestones: readonly { amount: bigint; verifier: string; done: boolean }[];
  session: { executor: string; target: string; spendCap: bigint; spent: bigint; executorActive: boolean };
};

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export type Incoming = {
  promised: bigint;
  paid: bigint;
  remaining: bigint;
  status: string;
  next?: { index: number; amount: bigint; verifier: string };
};

/** What a project budget means for its recipient. Null if `me` isn't the recipient. */
export function incomingFor(t: TaskLike, me: string, name: (a: string) => string = (a) => shortHex(a)): Incoming | null {
  if (t.task.kind !== TaskKind.ProjectBudget || !eq(t.task.recipient, me)) return null;
  const promised = t.milestones.reduce((s, m) => s + m.amount, 0n);
  const paid = t.milestones.filter((m) => m.done).reduce((s, m) => s + m.amount, 0n);
  const nextIdx = t.milestones.findIndex((m) => !m.done);
  const next = nextIdx >= 0 ? { index: nextIdx, amount: t.milestones[nextIdx].amount, verifier: t.milestones[nextIdx].verifier } : undefined;
  const state = t.task.state as TaskState;
  let status: string;
  if (state === TaskState.Completed) status = `Fully paid: you received ${fmtToken(paid)}.`;
  else if (state === TaskState.Expired)
    status = paid > 0n ? `Expired. You kept the ${fmtToken(paid)} already paid; the rest went back to the owner.` : "Expired before any checkpoint was confirmed.";
  else if (state === TaskState.Cancelled) status = "Cancelled by the owner before it started.";
  else if (state === TaskState.Funded) status = "Funded but not started yet. The owner still has to activate it.";
  else if (next)
    status = `Next: ${fmtToken(next.amount)} when ${name(next.verifier)} confirms checkpoint ${next.index + 1}, before ${fmtDate(t.task.deadline)}.`;
  else status = "All checkpoints confirmed.";
  return { promised, paid, remaining: promised - paid, status, next };
}

export type Allowance = { canSpend: boolean; left: bigint; status: string };

/** What a spending session means for its executor. Null if `me` isn't the executor. */
export function allowanceFor(t: TaskLike, me: string, name: (a: string) => string = (a) => shortHex(a)): Allowance | null {
  if (t.task.kind !== TaskKind.SpendingSession || !eq(t.session.executor, me)) return null;
  const left = t.session.spendCap - t.session.spent;
  const open = t.task.state === TaskState.Active && t.session.executorActive;
  const status = open
    ? `You may spend up to ${fmtToken(left)} more, only on ${name(t.session.target)}, until ${fmtDate(t.task.deadline)}.`
    : t.task.state === TaskState.Completed
      ? `Job done: you spent ${fmtToken(t.session.spent)} and your access was removed automatically.`
      : "Your access has ended.";
  return { canSpend: open, left: open ? left : 0n, status };
}
