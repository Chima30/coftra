import { describe, expect, it } from "vitest";
import { MANUAL_RECOVERY_SECONDS, healthTotals, refusedCallbacks, taskHealth } from "./health";
import { CallbackResult, TaskKind, TaskState } from "./protocol";
import type { TaskLike } from "./roles";

const NOW = 1_800_000_000;
const OK = { reactive: "ok", callbacks: "ok" } as const;
const ZERO = "0x0000000000000000000000000000000000000000";
const U = 1_000_000n;

const task = (state: TaskState, deadline: number, done = [false, false]): TaskLike & { available: bigint; reserved: bigint } => ({
  id: 4n,
  task: { owner: "0x8FCF5415CC8c338D4523Be5a04bb758B5437810f", kind: TaskKind.ProjectBudget, state, deadline: BigInt(deadline), recipient: "0x51bB0Cd67C6955f63a880485A996D9E3a5490dba", refundTo: "0x8FCF5415CC8c338D4523Be5a04bb758B5437810f", deposited: 100n * U, released: done[0] ? 30n * U : 0n, refunded: 0n },
  milestones: [
    { amount: 30n * U, verifier: "0x8FCF5415CC8c338D4523Be5a04bb758B5437810f", done: done[0] },
    { amount: 50n * U, verifier: "0x8FCF5415CC8c338D4523Be5a04bb758B5437810f", done: done[1] },
  ],
  session: { executor: ZERO, target: ZERO, spendCap: 0n, spent: 0n, executorActive: false },
  available: 20n * U,
  reserved: done[0] ? 50n * U : 80n * U,
});

describe("taskHealth", () => {
  it("closed states speak for themselves", () => {
    expect(taskHealth(task(TaskState.Completed, NOW), { now: NOW, funding: OK }).label).toBe("Completed");
    expect(taskHealth(task(TaskState.Expired, NOW), { now: NOW, funding: OK }).label).toBe("Expired");
    expect(taskHealth(task(TaskState.Cancelled, NOW), { now: NOW, funding: OK }).label).toBe("Cancelled");
  });

  it("a funded task that isn't switched on needs attention", () => {
    expect(taskHealth(task(TaskState.Funded, NOW + 3600), { now: NOW, funding: OK }).label).toBe("Attention needed");
  });

  it("an active task far from its deadline, with funding, is healthy and says what it's waiting for", () => {
    const h = taskHealth(task(TaskState.Active, NOW + 3 * 86_400, [true, false]), { now: NOW, funding: OK, callbacks: [CallbackResult.Applied] });
    expect(h.label).toBe("Healthy");
    expect(h.reasons.join(" ")).toMatch(/confirm checkpoint 2/);
  });

  it("deadline within a day → expiring soon; just past → expiring soon; 30 min past → recovery available", () => {
    expect(taskHealth(task(TaskState.Active, NOW + 3600), { now: NOW, funding: OK }).label).toBe("Expiring soon");
    expect(taskHealth(task(TaskState.Active, NOW - 60), { now: NOW, funding: OK }).label).toBe("Expiring soon");
    const r = taskHealth(task(TaskState.Active, NOW - MANUAL_RECOVERY_SECONDS - 1), { now: NOW, funding: OK });
    expect(r.label).toBe("Recovery available");
    expect(r.reasons[1]).toMatch(/Anyone can now run the fallback by hand/);
  });

  it("blocked funding and refused callbacks are surfaced, harmless results are not", () => {
    expect(taskHealth(task(TaskState.Active, NOW + 3 * 86_400), { now: NOW, funding: { reactive: "blocked", callbacks: "ok" } }).label).toBe("Funding warning");
    expect(taskHealth(task(TaskState.Active, NOW + 3 * 86_400), { now: NOW, funding: OK, callbacks: [CallbackResult.WrongVerifier] }).label).toBe("Attention needed");
    expect(taskHealth(task(TaskState.Active, NOW + 3 * 86_400), { now: NOW, funding: OK, callbacks: [CallbackResult.NotYetDue, CallbackResult.AlreadyApplied] }).label).toBe("Healthy");
    expect(refusedCallbacks([CallbackResult.Applied, CallbackResult.StaleConfig, CallbackResult.NotYetDue])).toBe(1);
  });

  it("says Status unknown instead of guessing", () => {
    expect(taskHealth(task(TaskState.Active, NOW + 3 * 86_400), { now: NOW }).label).toBe("Status unknown");
    expect(taskHealth(task(TaskState.Active, NOW + 3 * 86_400), { now: 0, funding: OK }).label).toBe("Status unknown");
  });
});

describe("healthTotals", () => {
  it("adds up open tasks only and counts labels", () => {
    const a = task(TaskState.Active, NOW + 3600, [true, false]);
    const b = { ...task(TaskState.Completed, NOW), id: 1n };
    const h = new Map([
      [a.id, taskHealth(a, { now: NOW, funding: OK })],
      [b.id, taskHealth(b, { now: NOW, funding: OK })],
    ]);
    const t = healthTotals([a, b], h);
    expect(t.open).toBe(1);
    expect(t.allocated).toBe(70n * U);
    expect(t.reserved).toBe(50n * U);
    expect(t.byLabel).toEqual({ "Expiring soon": 1, Completed: 1 });
    expect(t.nextDeadlines.map((d) => d.id)).toEqual([4n]);
  });
});
