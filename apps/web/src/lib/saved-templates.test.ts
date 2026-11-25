import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_TEMPLATES,
  cleanTemplate,
  describeTemplate,
  findTemplate,
  fmtDuration,
  parseTemplates,
  removeTemplate,
  saveTemplate,
  templateFromTask,
} from "./saved-templates";
import { TaskKind } from "./protocol";

const ME = "0x67b55ebde94ad5f3e25a8f78fb0ece4a971d575f";
const ADA = "0x1aB08630eFd349E28e9928694dA7018B002C5280";
const SAM = "0x84BF8c5143Ba3937D8FD12Fd24788A67Eb55e264";
const BOT = "0x00000000000000000000000000000000000000E1";
const U = 1_000_000n;

const project = {
  kind: TaskKind.ProjectBudget,
  name: "  Logo   for Ada ",
  budget: "100",
  recipient: ADA,
  refundTo: ME,
  durationSec: 3600,
  milestones: [
    { amount: "30", verifier: SAM },
    { amount: "50.5", verifier: SAM },
  ],
};

// Minimal browser stand-ins so the store can be exercised in Node.
beforeEach(() => {
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  g.window = { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} };
});

describe("cleanTemplate", () => {
  it("normalises the name and keeps valid values", () => {
    const t = cleanTemplate(project)!;
    expect(t.name).toBe("Logo for Ada");
    expect(t.kind).toBe(TaskKind.ProjectBudget);
  });

  it("rejects anything that isn't a valid rule", () => {
    expect(cleanTemplate({ ...project, budget: "0" })).toBeNull();
    expect(cleanTemplate({ ...project, recipient: "0x123" })).toBeNull();
    expect(cleanTemplate({ ...project, milestones: [] })).toBeNull();
    expect(cleanTemplate({ ...project, milestones: [{ amount: "-1", verifier: SAM }] })).toBeNull();
    expect(cleanTemplate({ ...project, name: "   " })).toBeNull();
    expect(cleanTemplate({ ...project, kind: 7 })).toBeNull();
    expect(cleanTemplate({ kind: TaskKind.SpendingSession, name: "x", budget: "40", refundTo: ME, durationSec: 3600, executor: BOT })).toBeNull(); // no cap
    expect(cleanTemplate(null)).toBeNull();
  });

  it("keeps deadlines between 15 minutes and a year", () => {
    expect(cleanTemplate({ ...project, durationSec: 60 })!.durationSec).toBe(15 * 60);
    expect(cleanTemplate({ ...project, durationSec: 10 * 365 * 86400 })!.durationSec).toBe(365 * 86400);
  });
});

describe("parseTemplates", () => {
  it("drops malformed entries instead of half-loading them", () => {
    expect(parseTemplates("{nope")).toEqual([]);
    expect(parseTemplates(JSON.stringify({ not: "a list" }))).toEqual([]);
    const list = parseTemplates(JSON.stringify([{ ...project, id: "a", savedAt: 1 }, { ...project, id: "b", budget: "x" }, { ...project }]));
    expect(list.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("templateFromTask", () => {
  it("repeats a project budget with exact amounts and the same deadline length", () => {
    const t = templateFromTask(
      {
        id: 4n,
        task: { kind: TaskKind.ProjectBudget, deadline: 1_000_000_000n + 3600n, createdAt: 1_000_000_000n, recipient: ADA, refundTo: ME, deposited: 100_250_000n },
        milestones: [
          { amount: 30n * U, verifier: SAM },
          { amount: 50_000_001n, verifier: SAM },
        ],
        session: { executor: "0x0000000000000000000000000000000000000000", spendCap: 0n },
      },
      "Repeat of task #4",
    )!;
    expect(t).toMatchObject({ kind: TaskKind.ProjectBudget, budget: "100.25", recipient: ADA, durationSec: 3600 });
    expect(t.kind === TaskKind.ProjectBudget && t.milestones.map((m) => m.amount)).toEqual(["30", "50.000001"]);
  });

  it("repeats a spending session", () => {
    const t = templateFromTask(
      {
        id: 3n,
        task: { kind: TaskKind.SpendingSession, deadline: 2_000n + 7_200n, createdAt: 2_000n, recipient: ME, refundTo: ME, deposited: 40n * U },
        milestones: [],
        session: { executor: BOT, spendCap: 25n * U },
      },
      "Bot mint",
    )!;
    expect(t).toMatchObject({ kind: TaskKind.SpendingSession, budget: "40", cap: "25", executor: BOT, durationSec: 7200 });
    expect(describeTemplate(t, (a) => (a === BOT ? "the bot" : a))).toBe("40 tUSDC · the bot may spend 25 tUSDC · 2 hours deadline");
  });
});

describe("describeTemplate and fmtDuration", () => {
  it("says what a template sets up in one line", () => {
    expect(describeTemplate(cleanTemplate(project)!, (a) => (a === ADA ? "Ada" : a))).toBe("100 tUSDC · 2 checkpoints · to Ada · 1 hour deadline");
  });
  it("formats durations", () => {
    expect([900, 3600, 5400, 86400, 3 * 86400].map(fmtDuration)).toEqual(["15 min", "1 hour", "1.5 hours", "24 hours", "3 days"]);
  });
});

describe("the store", () => {
  it("saves, finds and removes templates, newest first", () => {
    const a = saveTemplate(cleanTemplate(project)!);
    const b = saveTemplate(cleanTemplate({ ...project, name: "Second" })!);
    if (!("id" in a) || !("id" in b)) throw new Error("save failed");
    expect(findTemplate(b.id)?.name).toBe("Second");
    expect(findTemplate(null)).toBeUndefined();
    removeTemplate(b.id);
    expect(findTemplate(b.id)).toBeUndefined();
    expect(findTemplate(a.id)?.name).toBe("Logo for Ada");
  });

  it("refuses invalid rules and caps the number of templates", () => {
    expect(saveTemplate({ ...cleanTemplate(project)!, budget: "0" })).toEqual({ error: "Some values in this rule aren't valid, so it can't be saved." });
    for (let i = 0; i < MAX_TEMPLATES; i++) saveTemplate(cleanTemplate({ ...project, name: `T${i}` })!);
    expect(saveTemplate(cleanTemplate(project)!)).toEqual({ error: `You already have ${MAX_TEMPLATES} templates. Remove one first.` });
  });
});
