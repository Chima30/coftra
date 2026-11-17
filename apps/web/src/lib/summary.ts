import { fmtDate, fmtToken, shortHex } from "./format";
import { TaskKind } from "./protocol";

export type RuleInput =
  | {
      kind: TaskKind.ProjectBudget;
      amount: bigint;
      recipient: string;
      refundTo: string;
      deadline: number;
      milestones: { amount: bigint; verifier: string }[];
    }
  | {
      kind: TaskKind.SpendingSession;
      amount: bigint;
      refundTo: string;
      deadline: number;
      executor: string;
      target: string;
      beneficiary: string;
      spendCap: bigint;
      operation: string;
    };

/** Plain-language description of exactly what the contracts will enforce. */
export function ruleSentences(r: RuleInput): string[] {
  const out: string[] = [];
  if (r.kind === TaskKind.ProjectBudget) {
    const committed = r.milestones.reduce((s, m) => s + m.amount, 0n);
    const reserve = r.amount - committed;
    out.push(`You are funding a task with ${fmtToken(r.amount)}.`);
    r.milestones.forEach((m, i) => {
      out.push(
        `Checkpoint ${i + 1} can release ${fmtToken(m.amount)} to ${shortHex(r.recipient)} after ${shortHex(m.verifier)} attests it on-chain.`,
      );
    });
    if (reserve > 0n) out.push(`The remaining ${fmtToken(reserve)} is never payable to the recipient and returns to ${shortHex(r.refundTo)} when the task closes.`);
    out.push(`When the last checkpoint is released, the task closes automatically and any leftover is returned.`);
    out.push(
      `If the deadline (${fmtDate(r.deadline)}) passes first, completed payouts stay valid, further releases are frozen, and the unspent balance returns to ${shortHex(r.refundTo)}.`,
    );
    out.push(`Once active, you cannot cancel this budget before the deadline: it is a commitment to the recipient. You can always release a checkpoint yourself or extend the deadline.`);
  } else {
    out.push(`You are funding a spending session with ${fmtToken(r.amount)}.`);
    out.push(
      `${shortHex(r.executor)} may spend at most ${fmtToken(r.spendCap)} in total, and only by calling ${r.operation} on ${shortHex(r.target)} with ${shortHex(r.beneficiary)} as the recipient.`,
    );
    out.push(`Whatever that call mints goes directly to ${shortHex(r.beneficiary)}, never to the executor.`);
    out.push(`When ${shortHex(r.target)} mints to ${shortHex(r.beneficiary)} after the session has paid, the session closes: the executor loses access and unspent funds return to ${shortHex(r.refundTo)}.`);
    out.push(`At ${fmtDate(r.deadline)} the executor's access ends regardless, and leftovers return the same way. You can cancel at any time.`);
  }
  return out;
}

export function maxSpend(r: RuleInput) {
  if (r.kind === TaskKind.ProjectBudget) return r.milestones.reduce((s, m) => s + m.amount, 0n);
  return r.spendCap;
}
