import { deployment } from "./generated";

export * from "./generated";

export type Address = `0x${string}`;

/** Every contract the UI needs, or null if the protocol isn't fully deployed. Never invented. */
export function getDeployment() {
  if (!deployment || !deployment.vault || !deployment.reactive) return null;
  return {
    ...deployment,
    vault: deployment.vault,
    reactive: deployment.reactive,
    fromBlock: BigInt(deployment.vaultBlock ?? 0),
  };
}

export type Deployment = NonNullable<ReturnType<typeof getDeployment>>;

/** Base Sepolia callback proxy, verified with Reactive MCP get_network_info on 2026-11-17. */
export const CALLBACK_PROXY: Address = "0x476F44b11F5C942c58f4c8E3d0300E5710743585";

export const TOKEN_DECIMALS = 6;
export const TOKEN_SYMBOL = "tUSDC";
