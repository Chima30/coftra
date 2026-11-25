import { fmtToken, shortHex } from "./format";
import { TaskKind } from "./protocol";
import type { RuleInput } from "./summary";

export type Outcome = {
  /** The "if" part, e.g. "If Sam confirms both checkpoints before the deadline". */
  when: string;
  /** Where the money ends up, in plain words. */
  result: string[];
  /** Who or what closes the task in this case. */
  closedBy: string;
  /**
   * The exact split of the deposit (paid out, returned) when the rule alone decides it. Left out when it
   * depends on something the rule doesn't fix, such as the price of the mint. Tests check it adds up.
   */
  split?: { paid: bigint; returned: bigint };
};

const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * The few things that can happen to a rule, each with where the money ends up. Shown before signing.
 * Pure: the same rule always gives the same preview. Wording follows what the vault enforces:
 * - a checkpoint pays once, only after its verifier confirms (or the owner releases it directly);
 * - the last payment completes the task and returns the reserve in the same transaction;
 * - a session completes when the NFT it paid for reaches the owner, which revokes the executor;
 * - after the deadline the task expires; payouts already made stand and the rest goes back.
 */
export function outcomes(r: RuleInput, me?: string, name: (a: string) => string = (a) => shortHex(a)): Outcome[] {
  const who = (a: string) => (eq(a, me) ? "you" : name(a));
  const back = who(r.refundTo);
  const comesBack = (amt: bigint) => (back === "you" ? `${fmtToken(amt)} comes back to you` : `${fmtToken(amt)} goes back to ${back}`);
  const expiry = "Reactive Network closes it within a few minutes of the deadline. If automation is ever down, anyone can run the same fallback by hand 30 minutes after the deadline.";

  if (r.kind === TaskKind.ProjectBudget) {
    const to = who(r.recipient);
    const total = r.milestones.reduce((s, m) => s + m.amount, 0n);
    const reserve = r.amount - total;
    const gets = (amt: bigint) => (to === "you" ? `You get ${fmtToken(amt)}` : `${to} gets ${fmtToken(amt)}`);
    const verifiers = Array.from(new Set(r.milestones.map((m) => who(m.verifier))));
    const by = verifiers.length === 1 ? verifiers[0] : "the verifiers";
    const plural = by === "you" || verifiers.length > 1;
    const n = r.milestones.length;
    const what = n === 1 ? "the checkpoint" : n === 2 ? "both checkpoints" : `all ${n} checkpoints`;

    const list: Outcome[] = [
      {
        when: `If ${by} confirm${plural ? "" : "s"} ${what} before the deadline`,
        result: [
          `${gets(total)}, paid checkpoint by checkpoint as each one is confirmed.`,
          reserve > 0n ? `${cap(comesBack(reserve))}: the part no checkpoint pays out.` : "Nothing is left over: the checkpoints use the whole budget.",
        ],
        closedBy: "The task closes in the same transaction as the last payment.",
        split: { paid: total, returned: reserve },
      },
    ];
    if (r.milestones.length > 1) {
      const first = r.milestones[0].amount;
      list.push({
        when: "If only checkpoint 1 is confirmed in time",
        result: [`${gets(first)} and keeps it: payouts are never taken back.`, `${cap(comesBack(r.amount - first))} after the deadline.`],
        closedBy: expiry,
        split: { paid: first, returned: r.amount - first },
      });
    }
    list.push({
      when: "If nothing is confirmed before the deadline",
      result: [`${to === "you" ? "You get" : `${to} gets`} nothing.`, `${cap(comesBack(r.amount))}, all of it.`],
      closedBy: expiry,
      split: { paid: 0n, returned: r.amount },
    });
    return list;
  }

  const exec = who(r.executor);
  const forWhom = who(r.beneficiary) === "you" ? "you" : who(r.beneficiary);
  const left = r.amount - r.spendCap;
  return [
    {
      when: `If ${exec} mint${exec === "you" ? "" : "s"} the NFT for ${forWhom} before the deadline`,
      result: [
        `${exec === "you" ? "You spend" : `${cap(exec)} spends`} what the mint costs, never more than ${fmtToken(r.spendCap)}: the vault refuses anything above the limit.`,
        left > 0n ? `The rest, at least ${fmtToken(left)}, ${back === "you" ? "comes back to you" : `goes back to ${back}`}.` : `Whatever isn't spent ${back === "you" ? "comes back to you" : `goes back to ${back}`}.`,
      ],
      closedBy: `As soon as the NFT reaches ${forWhom}, Reactive Network closes the session and removes ${exec === "you" ? "your" : "their"} access.`,
    },
    {
      when: `If ${exec} spend${exec === "you" ? "" : "s"} nothing before the deadline`,
      result: [`${cap(comesBack(r.amount))}, all of it.`],
      closedBy: expiry,
      split: { paid: 0n, returned: r.amount },
    },
    {
      when: "If you end it early",
      result: [`Whatever hasn't been spent yet ${back === "you" ? "comes back to you" : `goes back to ${back}`} straight away.`],
      closedBy: "You can end a session yourself at any time.",
    },
  ];
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
