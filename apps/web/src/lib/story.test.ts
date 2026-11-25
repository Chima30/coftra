import { describe, expect, it } from "vitest";
import { allowanceFor, incomingFor, type TaskLike } from "./roles";
import { receiptCsv, taskStory, type StoryLog } from "./story";
import { TaskKind, TaskState } from "./protocol";

const OWNER = "0x67b55ebde94ad5f3e25a8f78fb0ece4a971d575f";
const RECIP = "0x1aB08630eFd349E28e9928694dA7018B002C5280";
const VERIF = "0x84BF8c5143Ba3937D8FD12Fd24788A67Eb55e264";
const EXEC = "0x00000000000000000000000000000000000000E1";
const TARGET = "0x08643a27E03AEef33daBb629091Cf15730b2d4FD";
const U = 1_000_000n; // 6 decimals

const project = (state: TaskState, done: boolean[]): TaskLike => ({
  id: 7n,
  task: { owner: OWNER, kind: TaskKind.ProjectBudget, state, deadline: 2_000_000_000n, recipient: RECIP, refundTo: OWNER, deposited: 100n * U, released: 0n, refunded: 0n },
  milestones: [
    { amount: 30n * U, verifier: VERIF, done: done[0] },
    { amount: 50n * U, verifier: VERIF, done: done[1] },
  ],
  session: { executor: "0x0000000000000000000000000000000000000000", target: "0x0000000000000000000000000000000000000000", spendCap: 0n, spent: 0n, executorActive: false },
});

const session = (state: TaskState, spent: bigint, active: boolean): TaskLike => ({
  id: 8n,
  task: { owner: OWNER, kind: TaskKind.SpendingSession, state, deadline: 2_000_000_000n, recipient: "0x0000000000000000000000000000000000000000", refundTo: OWNER, deposited: 20n * U, released: spent, refunded: 0n },
  milestones: [],
  session: { executor: EXEC, target: TARGET, spendCap: 10n * U, spent, executorActive: active },
});

let li = 0;
const log = (eventName: string, args: Record<string, unknown>, tx: string, block = 1n): StoryLog => ({
  eventName,
  args: { taskId: 7n, ...args },
  transactionHash: tx,
  logIndex: li++,
  blockNumber: block,
});

describe("incomingFor", () => {
  it("is null for anyone but the recipient, and for sessions", () => {
    expect(incomingFor(project(TaskState.Active, [false, false]), OWNER)).toBeNull();
    expect(incomingFor(session(TaskState.Active, 0n, true), RECIP)).toBeNull();
  });
  it("adds up promised, paid and remaining, and names the next checkpoint", () => {
    const r = incomingFor(project(TaskState.Active, [true, false]), RECIP.toLowerCase())!;
    expect(r.promised).toBe(80n * U);
    expect(r.paid).toBe(30n * U);
    expect(r.remaining).toBe(50n * U);
    expect(r.next?.index).toBe(1);
    expect(r.status).toMatch(/^Next: .*checkpoint 2/);
  });
  it("explains expiry and completion", () => {
    expect(incomingFor(project(TaskState.Expired, [true, false]), RECIP)!.status).toMatch(/You kept/);
    expect(incomingFor(project(TaskState.Expired, [false, false]), RECIP)!.status).toMatch(/before any checkpoint/);
    expect(incomingFor(project(TaskState.Completed, [true, true]), RECIP)!.status).toMatch(/^Fully paid/);
  });
});

describe("allowanceFor", () => {
  it("shows what's left while open, zero once closed", () => {
    const open = allowanceFor(session(TaskState.Active, 4n * U, true), EXEC)!;
    expect(open.canSpend).toBe(true);
    expect(open.left).toBe(6n * U);
    const done = allowanceFor(session(TaskState.Completed, 4n * U, false), EXEC)!;
    expect(done.canSpend).toBe(false);
    expect(done.left).toBe(0n);
    expect(done.status).toMatch(/removed automatically/);
    expect(allowanceFor(session(TaskState.Active, 0n, true), OWNER)).toBeNull();
  });
});

describe("taskStory", () => {
  const t = project(TaskState.Expired, [true, false]);
  const logs: StoryLog[] = [
    // out of order on purpose; the story sorts by block then log index
    log("Settled", { finalState: TaskState.Expired, released: 30n * U, refunded: 70n * U, refundTo: OWNER }, "0xccc", 5n),
    log("ReactiveCallbackHandled", { kind: 2, result: 0 }, "0xccc", 5n),
    log("TaskCreated", { kind: TaskKind.ProjectBudget, amount: 100n * U }, "0xaaa", 1n),
    log("TaskActivated", { deadline: 1n }, "0xaaa", 1n),
    log("MilestoneReleased", { milestoneIndex: 0n, recipient: RECIP, amount: 30n * U, viaReactive: true }, "0xbbb", 3n),
    log("ReactiveCallbackHandled", { kind: 0, result: 0 }, "0xbbb", 3n),
    log("TaskClosed", { finalState: TaskState.Expired }, "0xccc", 5n),
    { ...log("TaskCreated", { kind: 0, amount: 1n }, "0xddd"), args: { taskId: 99n } },
  ];

  it("tells the owner's story with 'you', in order, skipping other tasks and duplicate events", () => {
    const s = taskStory(t, logs, OWNER);
    expect(s.map((x) => x.event)).toEqual(["TaskCreated", "TaskActivated", "MilestoneReleased", "Settled"]);
    expect(s[0].text).toBe("You locked 100 tUSDC in the vault for a project budget.");
    expect(s[2].text).toMatch(/^The recipient was paid 30 tUSDC after 0x84BF…e264 confirmed checkpoint 1\. Reactive Network/);
    expect(s[3].text).toMatch(/ran out of time: 70 tUSDC came back to you\. Reactive Network closed it automatically\./);
    expect(s.map((x) => x.automatic)).toEqual([false, false, true, true]);
  });

  it("tells the recipient's story with 'you were paid'", () => {
    const s = taskStory(t, logs, RECIP);
    expect(s[0].text).toMatch(/^The owner locked/);
    expect(s[2].text).toMatch(/^You were paid 30 tUSDC/);
  });

  it("says plainly when the owner released a checkpoint without a verifier", () => {
    const s = taskStory(t, [log("MilestoneReleased", { milestoneIndex: 1n, recipient: RECIP, amount: 50n * U, viaReactive: false }, "0xeee")], undefined);
    expect(s[0].text).toBe("The recipient was paid 50 tUSDC for checkpoint 2, released by the owner directly (no verifier involved).");
    expect(s[0].automatic).toBe(false);
  });

  it("uses a saved label over the role name", () => {
    const s = taskStory(t, logs, OWNER, { [VERIF.toLowerCase()]: "Sam" });
    expect(s[2].text).toMatch(/after Sam confirmed/);
  });
});

describe("receiptCsv", () => {
  it("writes exact amounts, quotes commas, and links every transaction", () => {
    const t = project(TaskState.Expired, [true, false]);
    const steps = taskStory(t, [log("MilestoneReleased", { milestoneIndex: 0n, recipient: RECIP, amount: 30_500_001n, viaReactive: true }, "0xbbb", 3n)], OWNER, { [RECIP]: "Ada, Inc" });
    const csv = receiptCsv(t, steps, (h) => `https://x/tx/${h}`);
    const [head, row, end] = csv.split("\r\n");
    expect(head).toBe("task,step,what happened,event,amount (tUSDC),by,block,transaction,explorer");
    expect(row.startsWith('7,1,"Ada, Inc was paid 30.5 tUSDC after')).toBe(true);
    expect(row.endsWith(",MilestoneReleased,30.500001,person,3,0xbbb,https://x/tx/0xbbb")).toBe(true);
    expect(end).toBe("");
  });
});
