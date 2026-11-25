import { fmtToken, shortHex } from "./format";
import { TaskKind } from "./protocol";
import { maxSpend, type RuleInput } from "./summary";

/**
 * Pre-signing checks for a rule. Catches common configuration mistakes; it cannot judge whether a verifier
 * or executor is trustworthy, so nothing here ever declares a rule "safe".
 */
export type Finding = { level: "warning" | "note"; title: string; detail: string };

export type InspectContext = {
  owner: string;
  nowTs: number;
  /** Hours of open-task automation the reactive reserve covers (measured rate), if known. */
  runwayHours?: number;
};

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function inspectRule(r: RuleInput, ctx: InspectContext): Finding[] {
  const out: Finding[] = [];
  const hours = (r.deadline - ctx.nowTs) / 3600;

  if (ctx.runwayHours !== undefined && hours > ctx.runwayHours) {
    out.push({
      level: "warning",
      title: "Deadline outlasts the automation reserve",
      detail: `The reserve covers ≈${ctx.runwayHours.toFixed(1)} h of automation while tasks are open; your deadline is ${hours.toFixed(1)} h away. If it runs out, automation pauses for every task until someone tops it up. Funds stay safe and the manual fallback still works 30 min after the deadline.`,
    });
  }
  if (!eq(r.refundTo, ctx.owner)) {
    out.push({
      level: "warning",
      title: "Leftovers go to another address",
      detail: `Unspent funds will be returned to ${shortHex(r.refundTo)}, not to your connected wallet. Check this address carefully; it can't be changed later.`,
    });
  }

  if (r.kind === TaskKind.ProjectBudget) {
    const recipientVerifies = r.milestones.some((m) => eq(m.verifier, r.recipient));
    if (recipientVerifies) {
      out.push({
        level: "warning",
        title: "The recipient can approve their own payouts",
        detail: "At least one checkpoint is verified by the same address that receives the money. They could attest without delivering the work.",
      });
    }
    if (eq(r.recipient, ctx.owner)) {
      out.push({ level: "note", title: "You're paying yourself", detail: "The recipient is your own wallet. That's fine for testing, but the task does nothing useful otherwise." });
    }
    if (r.milestones.some((m) => eq(m.verifier, ctx.owner))) {
      out.push({
        level: "note",
        title: "You are the verifier",
        detail: "Payouts happen when you attest. That suits testing; for real work the recipient has to trust you to attest fairly.",
      });
    }
    const committed = maxSpend(r);
    if (committed === r.amount) {
      out.push({ level: "note", title: "No reserve", detail: "The checkpoints use the whole budget, so nothing comes back if every checkpoint is paid." });
    }
    if (r.milestones.length === 1 && committed === r.amount) {
      out.push({ level: "note", title: "All-or-nothing", detail: "A single checkpoint holds the whole budget. Consider splitting it so partial work can be paid." });
    }
    if (hours > 7 * 24) {
      out.push({
        level: "note",
        title: "Long commitment",
        detail: "Once active, a project budget can't be cancelled before its deadline. You can still pay checkpoints yourself with the owner override.",
      });
    }
  } else {
    if (eq(r.executor, ctx.owner)) {
      out.push({ level: "warning", title: "You are the executor", detail: "The vault rejects sessions where the owner is also the executor. Use the bot's address." });
    }
    if (r.spendCap === r.amount) {
      out.push({ level: "note", title: "No buffer", detail: "The cap equals the deposit, so nothing is returned if the bot spends the full cap." });
    } else {
      out.push({
        level: "note",
        title: "Guaranteed return",
        detail: `At least ${fmtToken(r.amount - r.spendCap)} always comes back, because the bot can spend at most ${fmtToken(r.spendCap)}.`,
      });
    }
  }
  return out;
}

export const hasWarnings = (f: Finding[]) => f.some((x) => x.level === "warning");
