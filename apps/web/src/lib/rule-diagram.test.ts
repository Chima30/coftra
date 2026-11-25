import { describe, expect, it } from "vitest";
import { ruleDiagram } from "./rule-diagram";
import { projectCreateArgs, sessionCreateArgs, approveArgs, SESSION_SELECTOR } from "./tx-builders";
import { TaskKind } from "./protocol";
import { fmtToken, shortHex } from "./format";

const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const OWNER = A(1);
const RECIPIENT = A(2);
const VERIFIER = A(3);
const BOT = A(4);
const NFT = A(5);
const TOKEN = A(6);
const VAULT = A(7);
const DEADLINE = 1_800_000_000;

const project = {
  kind: TaskKind.ProjectBudget as const,
  amount: 100_000_000n,
  recipient: RECIPIENT,
  refundTo: OWNER,
  deadline: DEADLINE,
  milestones: [
    { amount: 30_000_000n, verifier: VERIFIER },
    { amount: 50_000_000n, verifier: VERIFIER },
  ],
};

const session = {
  kind: TaskKind.SpendingSession as const,
  amount: 40_000_000n,
  refundTo: OWNER,
  deadline: DEADLINE,
  executor: BOT,
  target: NFT,
  beneficiary: OWNER,
  spendCap: 25_000_000n,
  operation: "mint(beneficiary)",
};

describe("rule diagram matches the signed arguments", () => {
  it("project: one WHEN per checkpoint verifier and one THEN payout per contract amount", () => {
    const d = ruleDiagram(project);
    const args = projectCreateArgs(project, TOKEN, true);
    const [, amount, recipient, refundTo, deadline, amounts, verifiers] = args;
    expect(amount).toBe(project.amount);
    expect(deadline).toBe(BigInt(DEADLINE));
    expect(d.when).toHaveLength(amounts.length);
    verifiers.forEach((v, i) => expect(d.when[i].text).toContain(shortHex(v)));
    amounts.forEach((a, i) => {
      expect(d.then[i].text).toContain(fmtToken(a));
      expect(d.then[i].text).toContain(shortHex(recipient));
    });
    // Reserve = budget − checkpoints, returned to the refund address.
    expect(d.then.at(-1)!.text).toContain(fmtToken(project.amount - 80_000_000n));
    expect(d.then.at(-1)!.detail).toContain(shortHex(refundTo));
    expect(d.otherwise[0].detail).toContain(shortHex(refundTo));
  });

  it("project without a reserve doesn't promise a refund on completion", () => {
    const exact = { ...project, amount: 80_000_000n };
    expect(ruleDiagram(exact).then.at(-1)!.text).toBe("After the last checkpoint: complete the task");
  });

  it("session: executor, cap, target and beneficiary match the contract call", () => {
    const d = ruleDiagram(session);
    const [, amount, params, refundTo] = sessionCreateArgs(session, TOKEN, true);
    expect(amount).toBe(40_000_000n);
    expect(params.selector).toBe(SESSION_SELECTOR);
    expect(d.when[0].text).toContain(shortHex(params.executor));
    expect(d.when[0].text).toContain(shortHex(params.target));
    expect(d.when[0].detail).toContain(fmtToken(params.spendCap));
    expect(d.when[1].text).toContain(shortHex(params.beneficiary));
    expect(d.then[0].detail).toContain(shortHex(refundTo));
  });

  it("approves exactly the task amount for the vault, never unlimited", () => {
    expect(approveArgs(project, VAULT)).toEqual([VAULT, 100_000_000n]);
    expect(approveArgs(session, VAULT)).toEqual([VAULT, 40_000_000n]);
  });

  it("only lets users edit supported fields: rules on step 1, deadline/refund on step 2", () => {
    const d = ruleDiagram(project);
    expect([...d.when, ...d.then].every((b) => b.editStep === 1)).toBe(true);
    expect(d.otherwise.every((b) => b.editStep === 2)).toBe(true);
  });
});
