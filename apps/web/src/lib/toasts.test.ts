import { describe, expect, it } from "vitest";
import { reactiveNotices } from "./toasts";
import type { StoryLog } from "./story";
import type { TaskLike } from "./roles";
import { TaskKind, TaskState } from "./protocol";

const OWNER = "0x67b55ebde94ad5f3e25a8f78fb0ece4a971d575f";
const ADA = "0x1aB08630eFd349E28e9928694dA7018B002C5280";
const SAM = "0x84BF8c5143Ba3937D8FD12Fd24788A67Eb55e264";
const ZERO = "0x0000000000000000000000000000000000000000";
const U = 1_000_000n;

const task = (id: bigint): TaskLike => ({
  id,
  task: { owner: OWNER, kind: TaskKind.ProjectBudget, state: TaskState.Active, deadline: 2_000_000_000n, recipient: ADA, refundTo: OWNER, deposited: 100n * U, released: 0n, refunded: 0n },
  milestones: [
    { amount: 30n * U, verifier: SAM, done: false },
    { amount: 50n * U, verifier: SAM, done: false },
  ],
  session: { executor: ZERO, target: ZERO, spendCap: 0n, spent: 0n, executorActive: false },
});

let li = 0;
const log = (taskId: bigint, eventName: string, args: Record<string, unknown>, tx: string): StoryLog => ({
  eventName,
  args: { taskId, ...args },
  transactionHash: tx,
  logIndex: li++,
  blockNumber: 10n,
});
const paid = (taskId: bigint, i: number, amount: bigint, viaReactive: boolean, tx: string) =>
  log(taskId, "MilestoneReleased", { milestoneIndex: BigInt(i), recipient: ADA, amount, viaReactive }, tx);
const callback = (taskId: bigint, tx: string, result = 0) => log(taskId, "ReactiveCallbackHandled", { kind: 0, result }, tx);

describe("reactiveNotices", () => {
  const names = { [ADA.toLowerCase()]: "Ada", [SAM.toLowerCase()]: "Sam" };

  it("announces a payment Reactive Network made, in the viewer's words", () => {
    const n = reactiveNotices([task(4n)], [paid(4n, 0, 30n * U, true, "0xa"), callback(4n, "0xa")], OWNER, names);
    expect(n).toEqual([
      {
        key: "4-0xa",
        taskId: 4n,
        tx: "0xa",
        text: "Ada was paid 30 tUSDC after Sam confirmed checkpoint 1. Reactive Network sent the payment automatically.",
      },
    ]);
  });

  it("joins everything one callback did into a single notice", () => {
    const logs = [
      paid(4n, 1, 50n * U, true, "0xb"),
      log(4n, "Settled", { finalState: TaskState.Completed, released: 80n * U, refunded: 20n * U, refundTo: OWNER }, "0xb"),
      callback(4n, "0xb"),
    ];
    const n = reactiveNotices([task(4n)], logs, OWNER, names);
    expect(n).toHaveLength(1);
    expect(n[0].text).toBe(
      "Ada was paid 50 tUSDC after Sam confirmed checkpoint 2. Reactive Network sent the payment automatically. The task finished: 20 tUSDC came back to you. Reactive Network closed it automatically.",
    );
  });

  it("ignores manual actions, refused callbacks and other people's tasks", () => {
    const logs = [
      paid(4n, 0, 30n * U, false, "0xc"), // owner override: no Reactive callback in this tx
      callback(4n, "0xd", 3), // a callback the vault refused changes nothing, so there is no step to announce
      paid(9n, 0, 30n * U, true, "0xe"),
      callback(9n, "0xe"), // task 9 isn't one of mine
    ];
    expect(reactiveNotices([task(4n)], logs, OWNER, names)).toEqual([]);
  });
});
