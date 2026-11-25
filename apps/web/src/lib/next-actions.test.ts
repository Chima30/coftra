import { describe, expect, it } from "vitest";
import { nextActions } from "./next-actions";
import { cleanContact, nameOf, parseContacts } from "./contacts";
import { receiptsCsv, taskStory, type StoryLog } from "./story";
import { TaskKind, TaskState } from "./protocol";
import type { TaskLike } from "./roles";

const OWNER = "0x67b55ebde94ad5f3e25a8f78fb0ece4a971d575f";
const RECIP = "0x1aB08630eFd349E28e9928694dA7018B002C5280";
const VERIF = "0x84BF8c5143Ba3937D8FD12Fd24788A67Eb55e264";
const EXEC = "0x00000000000000000000000000000000000000E1";
const TARGET = "0x08643a27E03AEef33daBb629091Cf15730b2d4FD";
const ZERO = "0x0000000000000000000000000000000000000000";
const U = 1_000_000n;
const NOW = 1_800_000_000;

const project = (id: bigint, state: TaskState, deadline: number, done = [false, false]): TaskLike => ({
  id,
  task: { owner: OWNER, kind: TaskKind.ProjectBudget, state, deadline: BigInt(deadline), recipient: RECIP, refundTo: OWNER, deposited: 80n * U, released: 0n, refunded: 0n },
  milestones: [
    { amount: 30n * U, verifier: VERIF, done: done[0] },
    { amount: 50n * U, verifier: VERIF, done: done[1] },
  ],
  session: { executor: ZERO, target: ZERO, spendCap: 0n, spent: 0n, executorActive: false },
});
const session = (id: bigint, deadline: number): TaskLike => ({
  id,
  task: { owner: OWNER, kind: TaskKind.SpendingSession, state: TaskState.Active, deadline: BigInt(deadline), recipient: ZERO, refundTo: OWNER, deposited: 20n * U, released: 4n * U, refunded: 0n },
  milestones: [],
  session: { executor: EXEC, target: TARGET, spendCap: 10n * U, spent: 4n * U, executorActive: true },
});

describe("nextActions", () => {
  const tasks = [
    project(1n, TaskState.Active, NOW + 7 * 86_400, [true, false]),
    project(2n, TaskState.Funded, NOW + 3 * 86_400),
    session(3n, NOW + 3_600),
    project(4n, TaskState.Completed, NOW - 10, [true, true]),
    project(5n, TaskState.Active, NOW - 120),
  ];

  it("owner: things to do first, then waiting, then info; closed tasks left out", () => {
    const a = nextActions(tasks, OWNER, NOW, (x) => (x.toLowerCase() === VERIF.toLowerCase() ? "Sam" : x.slice(0, 6)));
    expect(a.map((x) => [x.taskId, x.tone])).toEqual([
      [5n, "act"], // deadline passed: earliest deadline among "act"
      [2n, "act"], // funded but not switched on
      [1n, "wait"],
      [3n, "info"],
    ]);
    expect(a.find((x) => x.taskId === 1n)!.text).toMatch(/checkpoint 2 \(50 tUSDC to 0x1aB0\) is waiting on Sam/);
    expect(a.find((x) => x.taskId === 2n)!.text).toMatch(/not switched on/);
    expect(a.find((x) => x.taskId === 5n)!.text).toMatch(/close it yourself 30 minutes after the deadline/);
    expect(a.find((x) => x.taskId === 3n)!.soon).toBe(true);
    expect(a.find((x) => x.taskId === 1n)!.soon).toBe(false);
  });

  it("verifier is asked to confirm; recipient is told what comes next; executor sees what's left", () => {
    expect(nextActions([tasks[0]], VERIF, NOW)[0]).toMatchObject({ tone: "act" });
    expect(nextActions([tasks[0]], VERIF, NOW)[0].text).toMatch(/confirm checkpoint 2 .* releases 50 tUSDC/);
    expect(nextActions([tasks[0]], RECIP, NOW)[0].text).toMatch(/your next payment, 50 tUSDC, comes when 0x84BF…e264 confirms checkpoint 2/);
    expect(nextActions([tasks[2]], EXEC, NOW)[0].text).toMatch(/you can still spend 6 tUSDC/);
    expect(nextActions([tasks[1]], RECIP, NOW)).toEqual([]); // only the owner can activate
  });
});

describe("contacts", () => {
  it("validates and normalises", () => {
    expect(cleanContact("nope", "Ada")).toEqual({ error: "That isn't a valid 0x address." });
    expect(cleanContact(RECIP, "   ")).toEqual({ error: "Give the contact a name." });
    expect(cleanContact(` ${RECIP} `, "  Ada   Lovelace ")).toEqual({ address: RECIP.toLowerCase(), name: "Ada Lovelace" });
  });
  it("parses stored JSON defensively and looks names up case-insensitively", () => {
    expect(parseContacts("{bad json")).toEqual({});
    expect(parseContacts(null)).toEqual({});
    const c = parseContacts(JSON.stringify({ [RECIP]: "Ada", junk: "x", [VERIF]: 5 }));
    expect(c).toEqual({ [RECIP.toLowerCase()]: "Ada" });
    expect(nameOf(c, RECIP.toUpperCase().replace("0X", "0x"))).toBe("Ada");
    expect(nameOf(c, VERIF)).toBeUndefined();
  });
});

describe("receiptsCsv", () => {
  it("puts several tasks in one file, ordered by task id, with one header", () => {
    const log = (id: bigint, tx: string): StoryLog => ({
      eventName: "TaskCreated",
      args: { taskId: id, kind: TaskKind.ProjectBudget, amount: 80n * U },
      transactionHash: tx,
      logIndex: 0,
      blockNumber: id,
    });
    const logs = [log(2n, "0xb"), log(1n, "0xa")];
    const a = project(2n, TaskState.Active, NOW);
    const b = project(1n, TaskState.Active, NOW);
    const csv = receiptsCsv([a, b].map((t) => ({ t, steps: taskStory(t, logs, OWNER) })), (h) => `x/${h}`);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith("task,step,")).toBe(true);
    expect(lines[1].startsWith("1,1,You locked 80 tUSDC")).toBe(true);
    expect(lines[2].startsWith("2,1,You locked 80 tUSDC")).toBe(true);
  });
});
