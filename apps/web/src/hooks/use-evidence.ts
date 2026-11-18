"use client";

import { useQuery } from "@tanstack/react-query";
import { SCENARIOS } from "@/lib/evidence";
import { lasna } from "@/lib/chains";
import { destinationClient, lasnaClient } from "@/lib/wagmi";

export type ReceiptCheck =
  | { state: "confirmed"; gasUsed: bigint; feeWei: bigint | null }
  | { state: "reverted" }
  | { state: "unavailable" };

/**
 * Re-fetches every recorded receipt from its own chain. A hash that cannot be fetched is reported as
 * "unavailable", never as confirmed. Lasna reactive transactions carry no gas price (fees are billed to
 * the contract's reserves), so their fee is null.
 */
export function useEvidenceCheck() {
  return useQuery({
    queryKey: ["evidence-receipts"],
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const all = SCENARIOS.flatMap((s) => [
        ...(s.setup ?? []).map((x) => ({ hash: x.hash, chainId: 84532 })),
        ...s.hops.map((h) => ({ hash: h.hash, chainId: h.chainId })),
      ]);
      const out: Record<string, ReceiptCheck> = {};
      await Promise.all(
        all.map(async ({ hash, chainId }) => {
          const client = chainId === lasna.id ? lasnaClient : destinationClient;
          try {
            const r = await client.getTransactionReceipt({ hash });
            out[hash] =
              r.status === "success"
                ? { state: "confirmed", gasUsed: r.gasUsed, feeWei: r.effectiveGasPrice ? r.gasUsed * r.effectiveGasPrice : null }
                : { state: "reverted" };
          } catch {
            out[hash] = { state: "unavailable" };
          }
        }),
      );
      return out;
    },
  });
}
