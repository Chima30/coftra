import { fmtToken, shortHex } from "./format";
import { CallbackResult, TaskKind, TaskState } from "./protocol";
import type { TaskLike } from "./roles";

/**
 * Independent checks for any task, from its vault state, its vault events and the receipts of the transactions
 * involved. Pure: the page fetches the data, this decides pass or fail, and tests pin the rules.
 */

export type Check = { title: string; status: "pass" | "fail" | "info"; detail: string; tx?: string };

export type VerifyLog = { eventName: string; args: Record<string, unknown>; transactionHash: string };
export type Transfer = { from: string; to: string; amount: bigint };
export type VerifyInput = {
  t: TaskLike & { available: bigint; reserved: bigint };
  /** Vault events for this task (TaskCreated, MilestoneReleased, SessionExecuted, Settled, ReactiveCallbackHandled). */
  logs: VerifyLog[];
  /** For each transaction involved: who it was sent to, and the token transfers in its receipt. */
  txs: Record<string, { to: string | null; transfers: Transfer[] }>;
  vault: string;
  callbackProxy: string;
};

const eq = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function verifyTask({ t, logs, txs, vault, callbackProxy }: VerifyInput): Check[] {
  const out: Check[] = [];
  const state = t.task.state as TaskState;
  if (state === TaskState.None) return [{ title: "Task exists", status: "fail", detail: "The vault has no task with this id." }];
  out.push({ title: "Task exists", status: "pass", detail: `State in the vault: ${TaskState[state]}.` });

  const by = (name: string) => logs.filter((l) => l.eventName === name);
  const callbackTxs = new Set(by("ReactiveCallbackHandled").filter((l) => Number(l.args.result) === CallbackResult.Applied).map((l) => l.transactionHash));
  const sentToVaultAs = (hash: string, to: string, amount: bigint) =>
    (txs[hash]?.transfers ?? []).some((x) => eq(x.from, vault) && eq(x.to, to) && x.amount === amount);

  // 1. Creation
  const created = by("TaskCreated")[0];
  if (!created) out.push({ title: "Creation event found", status: "fail", detail: "No TaskCreated event for this task in the vault's logs." });
  else {
    const ok = eq(created.args.owner as string, t.task.owner) && (created.args.amount as bigint) === t.task.deposited;
    out.push({
      title: "Created as the vault records it",
      status: ok ? "pass" : "fail",
      detail: `Owner ${shortHex(created.args.owner as string)} deposited ${fmtToken(created.args.amount as bigint)}; the vault holds the task under ${shortHex(t.task.owner)} with ${fmtToken(t.task.deposited)}.`,
      tx: created.transactionHash,
    });
  }

  // 2. The books balance
  const open = state === TaskState.Active || state === TaskState.Funded;
  const accounted = t.task.released + t.task.refunded + (open ? t.available + t.reserved : 0n);
  out.push({
    title: "Every token is accounted for",
    status: accounted === t.task.deposited ? "pass" : "fail",
    detail: `Deposited ${fmtToken(t.task.deposited)} = paid out ${fmtToken(t.task.released)} + returned ${fmtToken(t.task.refunded)}${open ? ` + still held ${fmtToken(t.available + t.reserved)}` : ""}.`,
  });

  // 3. Checkpoint payments
  if (t.task.kind === TaskKind.ProjectBudget) {
    const releases = by("MilestoneReleased");
    const seen = new Map<number, number>();
    for (const r of releases) {
      const i = Number(r.args.milestoneIndex);
      seen.set(i, (seen.get(i) ?? 0) + 1);
      const m = t.milestones[i];
      const amount = r.args.amount as bigint;
      const rightTerms = !!m && amount === m.amount && eq(r.args.recipient as string, t.task.recipient);
      const moved = sentToVaultAs(r.transactionHash, t.task.recipient, amount);
      out.push({
        title: `Checkpoint ${i + 1} paid as the rule says`,
        status: rightTerms && moved ? "pass" : "fail",
        detail: `${fmtToken(amount)} to ${shortHex(r.args.recipient as string)}${m ? ` (rule: ${fmtToken(m.amount)} to ${shortHex(t.task.recipient)})` : ""}; ${moved ? "the token transfer is in the receipt" : "no matching token transfer in the receipt"}.`,
        tx: r.transactionHash,
      });
      if (r.args.viaReactive) {
        const viaProxy = eq(txs[r.transactionHash]?.to, callbackProxy);
        out.push({
          title: `Checkpoint ${i + 1} was paid by Reactive Network`,
          status: viaProxy && callbackTxs.has(r.transactionHash) ? "pass" : "fail",
          detail: `${viaProxy ? "Delivered through Reactive's callback proxy" : "Not sent through Reactive's callback proxy"}${callbackTxs.has(r.transactionHash) ? ", and the vault recorded the callback as applied." : "; no applied callback in the same transaction."}`,
          tx: r.transactionHash,
        });
      } else {
        out.push({ title: `Checkpoint ${i + 1} was paid by owner override`, status: "info", detail: "A transaction signed by the owner, not a Reactive automation. Only allowed for that checkpoint's fixed amount, to the set recipient, before the deadline.", tx: r.transactionHash });
      }
    }
    const once = [...seen.values()].every((n) => n === 1) && t.milestones.every((m, i) => m.done === seen.has(i));
    out.push({
      title: "Each checkpoint paid at most once",
      status: once ? "pass" : "fail",
      detail: `${seen.size} of ${t.milestones.length} checkpoint${t.milestones.length > 1 ? "s" : ""} paid; the vault's "paid" flags match the payment events.`,
    });
  } else {
    // 3b. Session spending
    const spent = by("SessionExecuted").reduce((s, l) => s + (l.args.spent as bigint), 0n);
    out.push({
      title: "Spending stayed within the cap",
      status: spent === t.session.spent && spent <= t.session.spendCap ? "pass" : "fail",
      detail: `The executor spent ${fmtToken(spent)} across ${by("SessionExecuted").length} call${by("SessionExecuted").length === 1 ? "" : "s"}; cap ${fmtToken(t.session.spendCap)}.`,
    });
  }

  // 4. Closing
  const settled = by("Settled")[0];
  if (open) out.push({ title: "Still open", status: "info", detail: "The task hasn't closed yet, so there is no refund to check." });
  else if (!settled) out.push({ title: "Closing event found", status: "fail", detail: "The task is closed but no Settled event was found." });
  else {
    const refunded = settled.args.refunded as bigint;
    const moved = refunded === 0n || sentToVaultAs(settled.transactionHash, t.task.refundTo, refunded);
    out.push({
      title: "Leftovers went to the refund address",
      status: eq(settled.args.refundTo as string, t.task.refundTo) && refunded === t.task.refunded && moved ? "pass" : "fail",
      detail: `${fmtToken(refunded)} to ${shortHex(settled.args.refundTo as string)}${refunded > 0n ? (moved ? "; the token transfer is in the receipt." : "; no matching token transfer (it may have been kept as a claimable credit).") : "."}`,
      tx: settled.transactionHash,
    });
    const byReactive = callbackTxs.has(settled.transactionHash) && eq(txs[settled.transactionHash]?.to, callbackProxy);
    out.push({
      title: byReactive ? "Closed by Reactive Network" : "Closed by a signed transaction",
      status: "info",
      detail: byReactive
        ? `${TaskState[Number(settled.args.finalState) as TaskState]} through Reactive's callback proxy, with an applied callback in the same transaction.`
        : `${TaskState[Number(settled.args.finalState) as TaskState]} by someone's own transaction (cancel or the manual fallback).`,
      tx: settled.transactionHash,
    });
  }

  // 5. Callback channel
  const allCallbacks = by("ReactiveCallbackHandled");
  if (allCallbacks.length) {
    const hashes = [...new Set(allCallbacks.map((l) => l.transactionHash))];
    const viaProxy = hashes.filter((h) => eq(txs[h]?.to, callbackProxy)).length;
    const refused = allCallbacks.filter((l) => ![CallbackResult.Applied, CallbackResult.AlreadyApplied, CallbackResult.NotYetDue].includes(Number(l.args.result))).length;
    out.push({
      title: "Callbacks came only through Reactive's callback proxy",
      status: viaProxy === hashes.length ? "pass" : "fail",
      detail: `${viaProxy} of ${hashes.length} callback transaction${hashes.length > 1 ? "s" : ""} were sent to ${shortHex(callbackProxy)}.${refused ? ` The vault refused ${refused} request${refused > 1 ? "s" : ""}, which changed nothing.` : ""}`,
    });
  } else out.push({ title: "No Reactive callbacks yet", status: "info", detail: "Nothing automatic has happened for this task so far." });

  return out;
}
