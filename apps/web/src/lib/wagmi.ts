import { createConfig, fallback, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { createPublicClient } from "viem";
import { destination, lasna } from "./chains";

/**
 * Base Sepolia RPCs in priority order. The first is configurable (NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL) and
 * defaults to publicnode, which allows large eth_getLogs ranges. sepolia.base.org is only a fallback:
 * it caps getLogs at 200 blocks, which the history loader handles by splitting ranges (slower, still correct).
 */
const BASE_RPCS = Array.from(new Set([destination.rpcUrls.default.http[0], "https://sepolia.base.org"]));

const baseTransport = fallback(
  BASE_RPCS.map((url) => http(url, { retryCount: 1, timeout: 15_000 })),
  { rank: false },
);

export const wagmiConfig = createConfig({
  chains: [destination],
  // EIP-6963 discovery (on by default) adds each installed wallet by name; injected() is the fallback.
  connectors: [injected()],
  transports: { [destination.id]: baseTransport },
  ssr: true,
});

/** Read-only clients. No wallet is needed to inspect tasks or proofs. */
export const destinationClient = createPublicClient({ chain: destination, transport: baseTransport });
// Lasna has a single official public RPC (dev.reactive.network/reactive-mainnet#lasna-testnet).
export const lasnaClient = createPublicClient({ chain: lasna, transport: http(undefined, { retryCount: 2, timeout: 15_000 }) });

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
