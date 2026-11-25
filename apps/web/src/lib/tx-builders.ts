import { toFunctionSelector, type Address } from "viem";
import { TaskKind } from "./protocol";
import type { RuleInput } from "./summary";

/**
 * Exact contract arguments the Rule Builder sends. Kept pure so the same function feeds the wallet call,
 * the unit tests and the fork simulation: what is previewed is what is signed.
 */

export const SESSION_SELECTOR = toFunctionSelector("mint(address)");

/** Exact-amount approval: the vault may pull precisely the task budget, never more. */
export function approveArgs(rule: RuleInput, vault: Address) {
  return [vault, rule.amount] as const;
}

export function projectCreateArgs(rule: Extract<RuleInput, { kind: TaskKind.ProjectBudget }>, token: Address, activateNow: boolean) {
  return [
    token,
    rule.amount,
    rule.recipient as Address,
    rule.refundTo as Address,
    BigInt(rule.deadline),
    rule.milestones.map((m) => m.amount),
    rule.milestones.map((m) => m.verifier as Address),
    activateNow,
  ] as const;
}

export function sessionCreateArgs(rule: Extract<RuleInput, { kind: TaskKind.SpendingSession }>, token: Address, activateNow: boolean) {
  return [
    token,
    rule.amount,
    {
      executor: rule.executor as Address,
      target: rule.target as Address,
      selector: SESSION_SELECTOR,
      beneficiary: rule.beneficiary as Address,
      spendCap: rule.spendCap,
    },
    rule.refundTo as Address,
    BigInt(rule.deadline),
    activateNow,
  ] as const;
}
