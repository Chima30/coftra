import { fmtDate, fmtToken, shortHex } from "./format";
import { TaskKind } from "./protocol";
import type { RuleInput } from "./summary";

/**
 * WHEN / THEN / OTHERWISE view of a rule, derived from the same RuleInput that builds the contract
 * arguments (lib/tx-builders.ts), so the picture cannot drift from what is signed. `editStep` is the
 * Rule Builder step that controls each block: only supported parameters are editable.
 */
export type RuleBlock = { text: string; detail?: string; editStep: 1 | 2 };
export type RuleDiagram = { when: RuleBlock[]; then: RuleBlock[]; otherwise: RuleBlock[] };

export function ruleDiagram(r: RuleInput): RuleDiagram {
  if (r.kind === TaskKind.ProjectBudget) {
    const committed = r.milestones.reduce((s, m) => s + m.amount, 0n);
    const reserve = r.amount - committed;
    return {
      when: r.milestones.map((m, i) => ({
        text: `${shortHex(m.verifier)} attests checkpoint ${i + 1}`,
        detail: "On-chain attestation, relayed by Reactive Network, before the deadline",
        editStep: 1,
      })),
      then: [
        ...r.milestones.map((m, i) => ({
          text: `Pay ${fmtToken(m.amount)} to ${shortHex(r.recipient)}`,
          detail: `Checkpoint ${i + 1}, once only`,
          editStep: 1 as const,
        })),
        {
          text: reserve > 0n ? `After the last checkpoint: complete and return ${fmtToken(reserve)}` : "After the last checkpoint: complete the task",
          detail: reserve > 0n ? `Reserve goes to ${shortHex(r.refundTo)}` : undefined,
          editStep: 1,
        },
      ],
      otherwise: [
        {
          text: `If ${fmtDate(r.deadline)} passes first: expire`,
          detail: `Unpaid checkpoints are frozen; the unspent balance returns to ${shortHex(r.refundTo)}. Paid checkpoints stay paid.`,
          editStep: 2,
        },
      ],
    };
  }
  return {
    when: [
      { text: `${shortHex(r.executor)} calls ${r.operation} on ${shortHex(r.target)}`, detail: `Spending at most ${fmtToken(r.spendCap)} in total`, editStep: 1 },
      { text: `The mint to ${shortHex(r.beneficiary)} is observed on-chain`, detail: "Watched by Reactive Network", editStep: 1 },
    ],
    then: [
      {
        text: "Close the session",
        detail: `Revoke ${shortHex(r.executor)} and return the unspent balance to ${shortHex(r.refundTo)}`,
        editStep: 1,
      },
    ],
    otherwise: [
      {
        text: `At ${fmtDate(r.deadline)}: end the session`,
        detail: `The executor loses access; the unspent balance returns to ${shortHex(r.refundTo)}. You can also cancel at any time.`,
        editStep: 2,
      },
    ],
  };
}
