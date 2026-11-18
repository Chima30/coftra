import type { FundingHealth } from "./reads";

/**
 * Cost model, from dev.reactive.network/economy and Reactive MCP estimate_cost (2026-11-17):
 *   reaction fee  = (extraGas + reactGas) * baseFee * coeffPer1000 / 1000   (paid in lREACT)
 *   callback fee  = (gasUsed + proxy overhead) * destination gas price       (paid in Base Sepolia ETH)
 * extraGas = 100,000 and coeffPer1000 = 1000 were the live parameters at that date. They can change;
 * every figure derived here is an estimate and is labelled as one in the UI.
 */
export const ASSUMPTIONS = {
  extraGas: 100_000n,
  reactGas: 120_000n,
  callbackGasUsed: 250_000n,
  proxyOverheadGas: 130_000n, // measured by Reactive MCP trace on Base Sepolia, 2026-11-17
  measuredOn: "2026-11-17",
};

export const CRON_TIERS: Record<string, { name: string; blocks: number; approx: string }> = {
  "0xf02d6ea5c22a71cffe930a4523fcb4f129be6c804db50e4202fb4e0b07ccb514": { name: "Cron1", blocks: 1, approx: "~1 s" },
  "0x04463f7c1651e6b9774d7f85c85bb94654e3c46ca79b0c16fb16d4183307b687": { name: "Cron10", blocks: 10, approx: "~10 s" },
  "0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70": { name: "Cron100", blocks: 100, approx: "~2 min" },
  "0xe20b31294d84c3661ddc8f423abb9c70310d0cf172aa2714ead78029b325e3f4": { name: "Cron1000", blocks: 1000, approx: "~17 min" },
  "0xd214e1d84db704ed42d37f538ea9bf71e44ba28bc1cc088b2f5deca654677a56": { name: "Cron10000", blocks: 10000, approx: "~3 h" },
};

/**
 * Measured on Lasna 2026-11-18 from archive reserves: 0.4151 lREACT over 52.9 min with Cron100 running and
 * a few demo reactions. Used for runway because it reflects what the deployed contract actually spends
 * while any task is open. Testnet value; it changes with fee parameters.
 */
export const OBSERVED_LREACT_PER_MIN_WHILE_OPEN = 0.00785;

const LASNA_BLOCK_SECONDS = 1.077; // MCP estimate_cost, 2026-11-17

export type HealthLevel = "ok" | "low" | "blocked";

export function assessFunding(h: FundingHealth) {
  const perReaction = (ASSUMPTIONS.extraGas + ASSUMPTIONS.reactGas) * h.lasnaGasPrice;
  const perCallback = (ASSUMPTIONS.callbackGasUsed + ASSUMPTIONS.proxyOverheadGas) * h.destGasPrice;
  const tierHex = `0x${h.cronTopic.toString(16).padStart(64, "0")}`;
  const tier = CRON_TIERS[tierHex];
  const ticksPerDay = tier ? Math.floor(86400 / (tier.blocks * LASNA_BLOCK_SECONDS)) : 0;
  const cronPerDay = h.cronSubscribed ? perReaction * BigInt(ticksPerDay) : 0n;

  // Only system-contract reserves count. Observed on Lasna (2026-11-17): reaction fees drained reserves
  // while the RC's own balance stayed untouched, so the balance is shown but never treated as runway.
  const rcSpendable = h.rcReserves > h.rcDebt ? h.rcReserves - h.rcDebt : 0n;
  const vaultSpendable = h.vaultBalance > h.proxyDebt ? h.vaultBalance - h.proxyDebt : 0n;

  const runwayHoursEarly = Number(rcSpendable) / 1e18 / OBSERVED_LREACT_PER_MIN_WHILE_OPEN / 60;
  // Low when the reserve covers under 12 h of open-task automation at the measured rate.
  const reactive: HealthLevel =
    h.rcDebt > 0n || h.paused ? "blocked" : rcSpendable < perReaction * 50n || runwayHoursEarly < 12 ? "low" : "ok";
  const callbacks: HealthLevel =
    h.proxyDebt > 0n ? "blocked" : vaultSpendable < perCallback * 10n ? "low" : "ok";

  const runwayDays = cronPerDay > 0n ? Number(rcSpendable) / Number(cronPerDay) : null;
  /** Hours of open-task automation the reserve covers at the measured rate. */
  const runwayHoursWhileOpen = runwayHoursEarly;
  const callbacksAffordable = perCallback > 0n ? Number(vaultSpendable / perCallback) : null;

  return {
    perReaction,
    perCallback,
    tier,
    ticksPerDay,
    cronPerDay,
    rcSpendable,
    vaultSpendable,
    reactive,
    callbacks,
    runwayDays,
    runwayHoursWhileOpen,
    callbacksAffordable,
    canActivate: reactive !== "blocked" && callbacks !== "blocked",
  };
}
