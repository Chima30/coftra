import { defineChain } from "viem";
import { baseSepolia } from "viem/chains";

/** Reactive Lasna testnet. Values from dev.reactive.network/reactive-mainnet#lasna-testnet. */
export const lasna = defineChain({
  id: 5318007,
  name: "Reactive Lasna",
  nativeCurrency: { name: "Lasna REACT", symbol: "lREACT", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_LASNA_RPC_URL || "https://lasna-rpc.rnk.dev/"] },
  },
  blockExplorers: { default: { name: "Reactscan", url: "https://lasna.reactscan.net" } },
  testnet: true,
});

export const destination = {
  ...baseSepolia,
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://base-sepolia-rpc.publicnode.com"] },
  },
} as typeof baseSepolia;

export const SYSTEM_CONTRACT = "0x8888888888888888888888888888888888888888" as const;

export function explorerTx(chainId: number, hash: string) {
  if (chainId === lasna.id) return `${lasna.blockExplorers.default.url}/tx/${hash}`;
  return `${baseSepolia.blockExplorers.default.url}/tx/${hash}`;
}

export function explorerAddress(chainId: number, address: string) {
  if (chainId === lasna.id) return `${lasna.blockExplorers.default.url}/address/${address}`;
  return `${baseSepolia.blockExplorers.default.url}/address/${address}`;
}

export function chainName(chainId: number) {
  if (chainId === lasna.id) return "Reactive Lasna";
  if (chainId === baseSepolia.id) return "Base Sepolia";
  return `Chain ${chainId}`;
}
