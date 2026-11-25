import { fmtToken, relTime, shortHex } from "./format";
import { TaskKind, TaskState } from "./protocol";
import type { TaskLike } from "./roles";

export type NextAction = {
  taskId: bigint;
  /** "act": you have to do something. "wait": someone else does. "info": nothing to do, worth knowing. */
  tone: "act" | "wait" | "info";
  text: string;
  /** Deadline within a day (or already past) on an open task. */
  soon: boolean;
  deadline: bigint;
};

const DAY = 86_400;
const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const rank = { act: 0, wait: 1, info: 2 } as const;

/**
 * What each open task needs, from the viewer's side, most urgent first. Pure: `now` is passed in (seconds),
 * so the same tasks always give the same list.
 */
export function nextActions(
  tasks: readonly TaskLike[],
  me: string,
  now: number,
  name: (a: string) => string = (a) => shortHex(a),
): NextAction[] {
  const out: NextAction[] = [];
  for (const t of tasks) {
    const state = t.task.state as TaskState;
    if (state !== TaskState.Funded && state !== TaskState.Active) continue;
    const id = t.id;
    const owner = eq(t.task.owner, me);
    const left = Number(t.task.deadline) - now;
    const soon = state === TaskState.Active && left < DAY;
    const when = left > 0 ? `ends ${relTime(t.task.deadline, now)}` : `deadline passed ${relTime(t.task.deadline, now)}`;
    const add = (tone: NextAction["tone"], text: string) => out.push({ taskId: id, tone, text, soon, deadline: t.task.deadline });

    if (state === TaskState.Funded) {
      if (owner) add("act", `Task #${id} is funded but not switched on. Activate it so Reactive Network starts watching.`);
      continue;
    }

    if (left <= 0) {
      add(
        owner ? "act" : "info",
        owner
          ? `Task #${id}: the ${when}. Reactive Network normally closes it within minutes; if it hasn't, you can close it yourself 30 minutes after the deadline.`
          : `Task #${id}: the ${when}. It is about to be closed and the rest returned to the owner.`,
      );
      continue;
    }

    if (t.task.kind === TaskKind.ProjectBudget) {
      const i = t.milestones.findIndex((m) => !m.done);
      if (i < 0) continue;
      const m = t.milestones[i];
      const pay = `${fmtToken(m.amount)} to ${eq(t.task.recipient, me) ? "you" : name(t.task.recipient)}`;
      if (eq(m.verifier, me)) add("act", `Task #${id}: confirm checkpoint ${i + 1} when the work is done. That releases ${pay}. Task ${when}.`);
      else if (eq(t.task.recipient, me)) add("wait", `Task #${id}: your next payment, ${fmtToken(m.amount)}, comes when ${name(m.verifier)} confirms checkpoint ${i + 1}. Task ${when}.`);
      else if (owner) add("wait", `Task #${id}: checkpoint ${i + 1} (${pay}) is waiting on ${name(m.verifier)}. Task ${when}.`);
    } else {
      const left$ = t.session.spendCap - t.session.spent;
      if (eq(t.session.executor, me) && t.session.executorActive)
        add("info", `Task #${id}: you can still spend ${fmtToken(left$)} on ${name(t.session.target)}. Access ${when}.`);
      else if (owner)
        add("info", `Task #${id}: ${name(t.session.executor)} has spent ${fmtToken(t.session.spent)} of ${fmtToken(t.session.spendCap)}. Session ${when}; whatever is unused comes back automatically.`);
    }
  }
  return out.sort((a, b) => rank[a.tone] - rank[b.tone] || (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0));
}
