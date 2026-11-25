import { fmtToken, shortHex } from "./format";
import { TaskKind } from "./protocol";
import type { RuleInput } from "./summary";

export type Outcome = {
  /** The "if" part, e.g. "If Sam confirms both checkpoints in time". */
  when: string;
  /** Where every token ends up, in plain words. Amounts always add up to the deposit. */
  result: string[];
  /** Who closes the task in this case. */
  closedBy: string;
};

const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * The few things that can happen to a rule before it is signed, each with where the money ends up.
 * Pure, so the same rule always gives the same preview, and every case is checked by tests to add up.
 */
export function outcomes(r: RuleInput, me?: string, name: (a: string) => string = (a) => shortHex(a)): Outcome[] {
  const who = (a: string) => (eq(a, me) ? "you" : name(a));
  const back = who(r.refundTo);
  const backGets = (amt: bigint) => (back === "you" ? `${fmtToken(amt)} comes back to you` : `${fmtToken(amt)} goes back to ${back}`);

  if (r.kind === TaskKind.ProjectBudget) {
    const to = who(r.recipient);
    const total = r.milestones.reduce((s, m) => s + m.amount, 0n);
    const reserve = r.amount - total;
    const gets = (amt: bigint) => (to === "you" ? `You get ${fmtToken(amt)}` : `${to} gets ${fmtToken(amt)}`);
    const verifiers = Array.from(new Set(r.milestones.map((m) => who(m.verifier))));
    const by = verifiers.length === 1 ? verifiers[0] : "the verifiers";
    const list: Outcome[] = [
      {
        when: `If ${by} confirm${by === "you" || verifiers.length > 1 ? "" : "s"} ${r.milestones.length === 1 ? "the checkpoint" : `all ${r.milestones.length} checkpoints`} before the deadline`,
        result: [`${gets(total)}, paid checkpoint by checkpoint as each is confirmed.`, ...(reserve > 0n ? [`${backGets(reserve)} (the part no checkpoint pays out).`] : [])],
        closedBy: "Reactive Network closes the task right after the last payment.",
      },
    ];
    if (r.milestones.length > 1) {
      const first = r.milestones[0].amount;
      list.push({
        when: `If only checkpoint 1 is confirmed in time`,
        result: [`${gets(first)}, and keeps it.`, `${backGets(r.amount - first)} after the deadline.`],
        closedBy: "Reactive Network closes it about a minute after the deadline.",
      });
    }
    list.push({
      when: "If nothing is confirmed before the deadline",
      result: [`${to === "you" ? "You get" : `${to} gets`} nothing.`, `${backGets(r.amount)}, all of it.`],
      closedBy: "Reactive Network closes it about a minute after the deadline. If it ever doesn't, you can close it yourself 30 minutes later.",
    });
    return list;
  }

  const exec = who(r.executor);
  const target = name(r.target);
  const spends = (amt: bigint) => `${exec === "you" ? "You spend" : `${exec} spends`} ${fmtToken(amt)} on ${target}`;
  return [
    {
      when: `If ${exec} use${exec === "you" ? "" : "s"} the whole spending limit`,
      result: [`${spends(r.spendCap)}, and no more: the vault refuses anything above the limit.`, ...(r.amount > r.spendCap ? [`${backGets(r.amount - r.spendCap)}.`] : [])],
      closedBy: "Reactive Network closes the session and removes their access the moment the limit is reached.",
    },
    {
      when: `If ${exec} spend${exec === "you" ? "" : "s"} nothing before the deadline`,
      result: [`${backGets(r.amount)}, all of it.`],
      closedBy: "Reactive Network closes it about a minute after the deadline and removes their access.",
    },
    {
      when: "If you end it early",
      result: [`Whatever hasn't been spent yet ${back === "you" ? "comes back to you" : `goes back to ${back}`} straight away.`],
      closedBy: "You close it yourself, any time.",
    },
  ];
}
