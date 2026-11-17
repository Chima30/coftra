import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { createPublicClient } from "viem";
import { destination, lasna } from "./chains";

export const wagmiConfig = createConfig({
  chains: [destination],
  connectors: [injected()],
  transports: { [destination.id]: http() },
  ssr: true,
});

/** Read-only clients. No wallet is needed to inspect tasks or proofs. */
export const destinationClient = createPublicClient({ chain: destination, transport: http() });
export const lasnaClient = createPublicClient({ chain: lasna, transport: http() });

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
