import { CONTRACTS, OBSERVED_COSTS, SCENARIOS, sourcifyUrl } from "@/lib/evidence";
import { explorerTx, explorerAddress, chainName } from "@/lib/chains";

// A machine-readable copy of the recorded evidence: the same data the Proof Center shows. It reads no request
// data, so with Cache Components Next prerenders it at build time.

export function GET() {
  const body = {
    project: "Coftra",
    network: "testnet only: Base Sepolia (84532) and Reactive Lasna (5318007); test tokens have no value",
    recordedOn: "2026-11-17",
    reverify: {
      inBrowser: "https://web-two-pied-ft7sms1616.vercel.app/proof (re-checks every receipt when it opens)",
      anyTask: "https://web-two-pied-ft7sms1616.vercel.app/verify?task=<id>",
      fromSource: "pnpm --dir apps/web verify:proofs",
    },
    contracts: CONTRACTS.map((c) => ({
      name: c.name,
      chain: chainName(c.chainId),
      chainId: c.chainId,
      address: c.address,
      explorer: explorerAddress(c.chainId, c.address),
      sourcify: sourcifyUrl(c.chainId, c.address),
      source: c.source ?? null,
    })),
    runs: SCENARIOS.map((s) => ({
      id: s.id,
      engine: s.engine,
      title: s.title,
      taskId: s.taskId,
      trigger: s.trigger,
      finalState: s.finalState,
      latencySeconds: s.latencySeconds,
      config: s.config,
      setup: (s.setup ?? []).map((x) => ({ label: x.label, hash: x.hash, explorer: explorerTx(84532, x.hash) })),
      hops: s.hops.map((h, i) => ({
        step: ["origin", "reactive", "callback"][i],
        label: h.label,
        chain: chainName(h.chainId),
        chainId: h.chainId,
        hash: h.hash,
        detail: h.detail,
        explorer: explorerTx(h.chainId, h.hash),
      })),
      outcome: s.outcome,
      share: `https://web-two-pied-ft7sms1616.vercel.app/proof/${s.id}`,
    })),
    observedCosts: OBSERVED_COSTS,
  };
  return Response.json(body, { headers: { "cache-control": "public, max-age=3600" } });
}
