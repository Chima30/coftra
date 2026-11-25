import { describe, expect, it } from "vitest";
import { hasWarnings, inspectRule } from "./inspect";
import { TaskKind } from "./protocol";

const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const OWNER = A(1);
const RECIPIENT = A(2);
const VERIFIER = A(3);
const NOW = 1_800_000_000;

const project = (over: Partial<Record<string, unknown>> = {}) => ({
  kind: TaskKind.ProjectBudget as const,
  amount: 100_000_000n,
  recipient: RECIPIENT,
  refundTo: OWNER,
  deadline: NOW + 3600,
  milestones: [
    { amount: 30_000_000n, verifier: VERIFIER },
    { amount: 50_000_000n, verifier: VERIFIER },
  ],
  ...over,
});

const titles = (f: { title: string }[]) => f.map((x) => x.title);

describe("safety inspector", () => {
  it("raises no warnings for a typical project budget", () => {
    const f = inspectRule(project(), { owner: OWNER, nowTs: NOW, runwayHours: 6.9 });
    expect(hasWarnings(f)).toBe(false);
  });

  it("warns when the recipient verifies their own checkpoint", () => {
    const f = inspectRule(project({ milestones: [{ amount: 30_000_000n, verifier: RECIPIENT }] }), { owner: OWNER, nowTs: NOW });
    expect(titles(f)).toContain("The recipient can approve their own payouts");
    expect(hasWarnings(f)).toBe(true);
  });

  it("warns when the deadline outlasts the automation reserve", () => {
    const f = inspectRule(project({ deadline: NOW + 24 * 3600 }), { owner: OWNER, nowTs: NOW, runwayHours: 6.9 });
    expect(titles(f)).toContain("Deadline outlasts the automation reserve");
  });

  it("warns when leftovers go to someone else (case-insensitive address compare)", () => {
    const f = inspectRule(project({ refundTo: A(9) }), { owner: OWNER.toUpperCase().replace("0X", "0x"), nowTs: NOW });
    expect(titles(f)).toContain("Leftovers go to another address");
    const same = inspectRule(project(), { owner: OWNER.toUpperCase().replace("0X", "0x"), nowTs: NOW });
    expect(titles(same)).not.toContain("Leftovers go to another address");
  });

  it("notes self-verification, no reserve and all-or-nothing", () => {
    const f = inspectRule(project({ amount: 30_000_000n, milestones: [{ amount: 30_000_000n, verifier: OWNER }] }), { owner: OWNER, nowTs: NOW });
    expect(titles(f)).toEqual(expect.arrayContaining(["You are the verifier", "No reserve", "All-or-nothing"]));
  });

  it("session: warns if the owner is the executor; reports the guaranteed return", () => {
    const base = {
      kind: TaskKind.SpendingSession as const,
      amount: 40_000_000n,
      refundTo: OWNER,
      deadline: NOW + 3600,
      executor: A(4),
      target: A(5),
      beneficiary: OWNER,
      spendCap: 25_000_000n,
      operation: "mint(beneficiary)",
    };
    expect(titles(inspectRule(base, { owner: OWNER, nowTs: NOW }))).toContain("Guaranteed return");
    expect(hasWarnings(inspectRule({ ...base, executor: OWNER }, { owner: OWNER, nowTs: NOW }))).toBe(true);
  });

  it("never claims a configuration is risk-free", () => {
    const f = inspectRule(project(), { owner: OWNER, nowTs: NOW });
    expect(JSON.stringify(f).toLowerCase()).not.toMatch(/risk-free|completely safe|no risk/);
  });
});
