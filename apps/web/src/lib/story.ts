import { formatUnits } from "viem";
import { TOKEN_DECIMALS, TOKEN_SYMBOL } from "./contracts";
import { fmtToken, shortHex } from "./format";
import { TaskKind, TaskState } from "./protocol";
import type { TaskLike } from "./roles";

/** The parts of a decoded vault log the story needs. Kept loose so tests can build logs by hand. */
export type StoryLog = {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: string;
  logIndex: number;
  blockNumber: bigint;
};

export type StoryStep = {
  /** One everyday sentence, e.g. "Ada was paid 30 tUSDC after Sam confirmed checkpoint 1." */
  text: string;
  /** Who moved money and how much, when the step moved any. */
  amount?: bigint;
  /** True when Reactive Network did this step, not a person. */
  automatic: boolean;
  event: string;
  tx: string;
  logIndex: number;
  block: bigint;
};

const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Name an address from the viewer's point of view: "you" first, then the role it plays in this task,
 * then a private label if the viewer saved one, then a short hex.
 */
export function namer(t: TaskLike, me?: string, labels: Record<string, string> = {}) {
  return (addr?: string): string => {
    if (!addr) return "someone";
    if (eq(addr, me)) return "you";
    const label = Object.entries(labels).find(([k]) => eq(k, addr))?.[1];
    if (label) return label;
    if (eq(addr, t.task.owner)) return "the owner";
    if (t.task.kind === TaskKind.ProjectBudget && eq(addr, t.task.recipient)) return "the recipient";
    if (t.task.kind === TaskKind.SpendingSession && eq(addr, t.session.executor)) return "the executor";
    return shortHex(addr);
  };
}

function ended(state: TaskState) {
  return state === TaskState.Completed ? "finished" : state === TaskState.Expired ? "ran out of time" : "was cancelled";
}

/** Turn a task's vault events into plain sentences, oldest first. Pure: same input, same story. */
export function taskStory(t: TaskLike, logs: readonly StoryLog[], me?: string, labels: Record<string, string> = {}): StoryStep[] {
  const name = namer(t, me, labels);
  const mine = logs
    .filter((l) => (l.args as { taskId?: bigint }).taskId === t.id)
    .slice()
    .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
  // A step is automatic when the same transaction carried a Reactive callback for this task.
  const reactiveTxs = new Set(mine.filter((l) => l.eventName === "ReactiveCallbackHandled").map((l) => l.transactionHash));
  const owner = name(t.task.owner);
  const steps: StoryStep[] = [];
  const push = (l: StoryLog, text: string, amount?: bigint) =>
    steps.push({
      text: cap(text),
      amount,
      automatic: reactiveTxs.has(l.transactionHash),
      event: l.eventName,
      tx: l.transactionHash,
      logIndex: l.logIndex,
      block: l.blockNumber,
    });

  for (const l of mine) {
    const a = l.args;
    switch (l.eventName) {
      case "TaskCreated": {
        const what = Number(a.kind) === TaskKind.ProjectBudget ? "a project budget" : "a spending session";
        push(l, `${owner} locked ${fmtToken(a.amount as bigint)} in the vault for ${what}.`, a.amount as bigint);
        break;
      }
      case "TaskActivated":
        push(l, `${owner} switched the automation on. Reactive Network now watches it.`);
        break;
      case "DeadlineExtended":
        push(l, `${owner} moved the deadline.`);
        break;
      case "MilestoneReleased": {
        const i = Number(a.milestoneIndex);
        const to = name(a.recipient as string);
        const amt = a.amount as bigint;
        const paid = to === "you" ? `you were paid ${fmtToken(amt)}` : `${to} was paid ${fmtToken(amt)}`;
        if (a.viaReactive) {
          const v = name(t.milestones[i]?.verifier);
          push(l, `${paid} after ${v} confirmed checkpoint ${i + 1}. Reactive Network sent the payment automatically.`, amt);
        } else {
          push(l, `${paid} for checkpoint ${i + 1}, released by ${owner} directly (no verifier involved).`, amt);
        }
        break;
      }
      case "SessionExecuted": {
        const who = name(t.session.executor);
        push(l, `${who} spent ${fmtToken(a.spent as bigint)} on ${name(a.target as string)}, as the session allows.`, a.spent as bigint);
        break;
      }
      case "ExecutorRevoked":
        push(l, `${name(a.executor as string)} lost access to the session.`);
        break;
      case "Settled": {
        const back = a.refunded as bigint;
        const to = name(a.refundTo as string);
        const how = reactiveTxs.has(l.transactionHash) ? " Reactive Network closed it automatically." : "";
        push(
          l,
          back > 0n
            ? `the task ${ended(Number(a.finalState))}: ${fmtToken(back)} came back to ${to}.${how}`
            : `the task ${ended(Number(a.finalState))}: nothing was left to return.${how}`,
          back > 0n ? back : undefined,
        );
        break;
      }
      // TaskClosed repeats Settled; ReactiveCallbackHandled is folded into "automatic" above.
    }
  }
  return steps;
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const HEAD = ["task", "step", "what happened", "event", `amount (${TOKEN_SYMBOL})`, "by", "block", "transaction", "explorer"];

function rows(t: TaskLike, steps: readonly StoryStep[], explorerTx: (hash: string) => string): string[][] {
  return steps.map((s, i) => [
    t.id.toString(),
    String(i + 1),
    s.text,
    s.event,
    s.amount !== undefined ? formatUnits(s.amount, TOKEN_DECIMALS) : "",
    s.automatic ? "Reactive Network" : "person",
    s.block.toString(),
    s.tx,
    explorerTx(s.tx),
  ]);
}

const toCsv = (table: string[][]) => table.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** One row per story step, ready to save as a .csv receipt. Amounts are exact decimals, not rounded. */
export function receiptCsv(t: TaskLike, steps: readonly StoryStep[], explorerTx: (hash: string) => string): string {
  return receiptsCsv([{ t, steps }], explorerTx);
}

/** Several tasks in one file, same columns, ordered by task id. For bookkeeping across everything you run. */
export function receiptsCsv(entries: readonly { t: TaskLike; steps: readonly StoryStep[] }[], explorerTx: (hash: string) => string): string {
  const sorted = [...entries].sort((a, b) => (a.t.id < b.t.id ? -1 : a.t.id > b.t.id ? 1 : 0));
  return toCsv([HEAD, ...sorted.flatMap((e) => rows(e.t, e.steps, explorerTx))]);
}
