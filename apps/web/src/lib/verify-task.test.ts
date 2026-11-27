import { describe, expect, it } from "vitest";
import { verifyTask, type VerifyLog } from "./verify-task";
import { TaskKind, TaskState } from "./protocol";

const VAULT = "0x2335A6D769bb3f6E6D4B1a48f6926A81aEA5b719";
const PROXY = "0x476F44b11F5C942c58f4c8E3d0300E5710743585";
const OWNER = "0x8FCF5415CC8c338D4523Be5a04bb758B5437810f";
const RECIP = "0x51bB0Cd67C6955f63a880485A996D9E3a5490dba";
const ZERO = "0x0000000000000000000000000000000000000000";
const U = 1_000_000n;

// Task #4 as it really ended: checkpoint 1 paid by Reactive, then expired by the Cron fallback with 70 returned.
const t = {
  id: 4n,
  task: { owner: OWNER, kind: TaskKind.ProjectBudget, state: TaskState.Expired, deadline: 1n, recipient: RECIP, refundTo: OWNER, deposited: 100n * U, released: 30n * U, refunded: 70n * U },
  milestones: [
    { amount: 30n * U, verifier: OWNER, done: true },
    { amount: 50n * U, verifier: OWNER, done: false },
  ],
  session: { executor: ZERO, target: ZERO, spendCap: 0n, spent: 0n, executorActive: false },
  available: 0n,
  reserved: 0n,
};
const logs: VerifyLog[] = [
  { eventName: "TaskCreated", args: { owner: OWNER, amount: 100n * U }, transactionHash: "0xcreate" },
  { eventName: "MilestoneReleased", args: { milestoneIndex: 0n, recipient: RECIP, amount: 30n * U, viaReactive: true }, transactionHash: "0xpay" },
  { eventName: "ReactiveCallbackHandled", args: { result: 0 }, transactionHash: "0xpay" },
  { eventName: "Settled", args: { finalState: TaskState.Expired, released: 30n * U, refunded: 70n * U, refundTo: OWNER }, transactionHash: "0xexpire" },
  { eventName: "ReactiveCallbackHandled", args: { result: 0 }, transactionHash: "0xexpire" },
];
const txs = {
  "0xpay": { to: PROXY.toLowerCase(), transfers: [{ from: VAULT, to: RECIP, amount: 30n * U }] },
  "0xexpire": { to: PROXY, transfers: [{ from: VAULT, to: OWNER, amount: 70n * U }] },
};

describe("verifyTask", () => {
  it("passes a task whose events, receipts and books agree", () => {
    const c = verifyTask({ t, logs, txs, vault: VAULT, callbackProxy: PROXY });
    expect(c.filter((x) => x.status === "fail")).toEqual([]);
    expect(c.map((x) => x.title)).toEqual([
      "Task exists",
      "Created as the vault records it",
      "Every token is accounted for",
      "Checkpoint 1 paid as the rule says",
      "Checkpoint 1 was paid by Reactive Network",
      "Each checkpoint paid at most once",
      "Leftovers went to the refund address",
      "Closed by Reactive Network",
      "Callbacks came only through Reactive's callback proxy",
    ]);
  });

  it("fails a payment that wasn't delivered through the callback proxy", () => {
    const c = verifyTask({ t, logs, txs: { ...txs, "0xpay": { ...txs["0xpay"], to: OWNER } }, vault: VAULT, callbackProxy: PROXY });
    expect(c.find((x) => x.title === "Checkpoint 1 was paid by Reactive Network")!.status).toBe("fail");
    expect(c.find((x) => x.title.startsWith("Callbacks came only"))!.status).toBe("fail");
  });

  it("fails when the amount, the receipt or the books don't match", () => {
    expect(verifyTask({ t, logs, txs: { ...txs, "0xpay": { ...txs["0xpay"], transfers: [] } }, vault: VAULT, callbackProxy: PROXY }).find((x) => x.title === "Checkpoint 1 paid as the rule says")!.status).toBe("fail");
    expect(verifyTask({ t: { ...t, task: { ...t.task, refunded: 60n * U } }, logs, txs, vault: VAULT, callbackProxy: PROXY }).find((x) => x.title === "Every token is accounted for")!.status).toBe("fail");
  });

  it("marks owner overrides and open tasks as information, not failures", () => {
    const manual = logs.map((l) => (l.eventName === "MilestoneReleased" ? { ...l, args: { ...l.args, viaReactive: false } } : l));
    const c = verifyTask({ t: { ...t, task: { ...t.task, state: TaskState.Active, refunded: 0n }, reserved: 50n * U, available: 20n * U }, logs: manual.filter((l) => l.eventName !== "Settled"), txs, vault: VAULT, callbackProxy: PROXY });
    expect(c.find((x) => x.title === "Checkpoint 1 was paid by owner override")!.status).toBe("info");
    expect(c.find((x) => x.title === "Still open")!.status).toBe("info");
    expect(c.filter((x) => x.status === "fail")).toEqual([]);
  });

  it("reports a missing task plainly", () => {
    expect(verifyTask({ t: { ...t, task: { ...t.task, state: TaskState.None } }, logs: [], txs: {}, vault: VAULT, callbackProxy: PROXY })).toEqual([
      { title: "Task exists", status: "fail", detail: "The vault has no task with this id." },
    ]);
  });
});
