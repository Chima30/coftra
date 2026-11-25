import { describe, expect, it } from "vitest";
import { outcomes } from "./outcomes";
import { TaskKind } from "./protocol";
import type { RuleInput } from "./summary";

const ME = "0x67b55ebde94ad5f3e25a8f78fb0ece4a971d575f";
const ADA = "0x1aB08630eFd349E28e9928694dA7018B002C5280";
const SAM = "0x84BF8c5143Ba3937D8FD12Fd24788A67Eb55e264";
const BOT = "0x00000000000000000000000000000000000000E1";
const NFT = "0x08643a27E03AEef33daBb629091Cf15730b2d4FD";
const U = 1_000_000n;
const names: Record<string, string> = { [ADA.toLowerCase()]: "Ada", [SAM.toLowerCase()]: "Sam" };
const name = (a: string) => names[a.toLowerCase()] ?? a.slice(0, 6);

const project = (amount: bigint, ms: bigint[], refundTo = ME): Extract<RuleInput, { kind: TaskKind.ProjectBudget }> => ({
  kind: TaskKind.ProjectBudget,
  amount,
  recipient: ADA,
  refundTo,
  deadline: 2_000_000_000,
  milestones: ms.map((m) => ({ amount: m, verifier: SAM })),
});

const session: RuleInput = {
  kind: TaskKind.SpendingSession,
  amount: 40n * U,
  refundTo: ME,
  deadline: 2_000_000_000,
  executor: BOT,
  target: NFT,
  beneficiary: ME,
  spendCap: 25n * U,
  operation: "mint(beneficiary)",
};

describe("outcomes: project budget", () => {
  const cases = outcomes(project(100n * U, [30n * U, 50n * U]), ME, name);

  it("lists success, partial and nothing, and every exact split adds up to the deposit", () => {
    expect(cases.map((c) => c.when)).toEqual([
      "If Sam confirms both checkpoints before the deadline",
      "If only checkpoint 1 is confirmed in time",
      "If nothing is confirmed before the deadline",
    ]);
    for (const c of cases) expect(c.split!.paid + c.split!.returned).toBe(100n * U);
    expect(cases.map((c) => c.split!.paid)).toEqual([80n * U, 30n * U, 0n]);
  });

  it("says who gets what, in the viewer's words", () => {
    expect(cases[0].result).toEqual([
      "Ada gets 80 tUSDC, paid checkpoint by checkpoint as each one is confirmed.",
      "20 tUSDC comes back to you: the part no checkpoint pays out.",
    ]);
    expect(cases[1].result[0]).toBe("Ada gets 30 tUSDC and keeps it: payouts are never taken back.");
    expect(cases[1].result[1]).toBe("70 tUSDC comes back to you after the deadline.");
    expect(cases[2].result).toEqual(["Ada gets nothing.", "100 tUSDC comes back to you, all of it."]);
    expect(cases[0].closedBy).toMatch(/same transaction as the last payment/);
    expect(cases[2].closedBy).toMatch(/anyone can run the same fallback by hand 30 minutes after the deadline/);
  });

  it("handles one checkpoint, no reserve, and a refund address that isn't yours", () => {
    const one = outcomes(project(50n * U, [50n * U], SAM), ME, name);
    expect(one).toHaveLength(2);
    expect(one[0].when).toBe("If Sam confirms the checkpoint before the deadline");
    expect(one[0].result[1]).toBe("Nothing is left over: the checkpoints use the whole budget.");
    expect(one[1].result[1]).toBe("50 tUSDC goes back to Sam, all of it.");
  });

  it("uses 'you' when the viewer is the verifier, and 'the verifiers' when there are several", () => {
    const mine = outcomes({ ...project(100n * U, [30n * U, 50n * U]), milestones: [{ amount: 30n * U, verifier: ME }, { amount: 50n * U, verifier: ME }] }, ME, name);
    expect(mine[0].when).toBe("If you confirm both checkpoints before the deadline");
    const mixed = outcomes({ ...project(100n * U, [30n * U, 50n * U]), milestones: [{ amount: 30n * U, verifier: ME }, { amount: 50n * U, verifier: SAM }] }, ME, name);
    expect(mixed[0].when).toBe("If the verifiers confirm both checkpoints before the deadline");
  });
});

describe("outcomes: spending session", () => {
  const cases = outcomes(session, ME, (a) => (a === BOT ? "the bot" : name(a)));

  it("closes on the NFT reaching you, never on the cap alone", () => {
    expect(cases[0].when).toBe("If the bot mints the NFT for you before the deadline");
    expect(cases[0].result[0]).toBe("The bot spends what the mint costs, never more than 25 tUSDC: the vault refuses anything above the limit.");
    expect(cases[0].result[1]).toBe("The rest, at least 15 tUSDC, comes back to you.");
    expect(cases[0].closedBy).toBe("As soon as the NFT reaches you, Reactive Network closes the session and removes their access.");
    expect(cases[0].split).toBeUndefined(); // depends on the mint price, which the rule doesn't fix
  });

  it("returns everything if nothing is spent, and can be ended early", () => {
    expect(cases[1].split).toEqual({ paid: 0n, returned: 40n * U });
    expect(cases[1].result).toEqual(["40 tUSDC comes back to you, all of it."]);
    expect(cases[2].when).toBe("If you end it early");
  });

  it("says 'whatever isn't spent' when the deposit equals the cap", () => {
    const tight = outcomes({ ...session, amount: 25n * U }, ME, name);
    expect(tight[0].result[1]).toBe("Whatever isn't spent comes back to you.");
  });
});
