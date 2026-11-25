"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, Link2 } from "lucide-react";
import { RecheckBanner, ScenarioCard } from "@/components/verified";
import { Button, Card } from "@/components/ui/primitives";
import { LINKS, SCENARIOS } from "@/lib/evidence";
import { MOVEMENTS } from "@/lib/evidence-replay";
import { AutomationReplay } from "@/components/replay";
import { Hex } from "@/components/hex";

/** One verified loop on its own shareable page. Same data and live re-check as /proof. */
export function ScenarioDetailView({ id }: { id: string }) {
  const s = SCENARIOS.find((x) => x.id === id)!;
  const [copied, setCopied] = useState(false);
  const others = SCENARIOS.filter((x) => x.id !== id);
  return (
    <div className="space-y-5">
      <Link href="/proof" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" /> All verified automations
      </Link>
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <RecheckBanner />
          <p className="text-xs text-fg-subtle">Recorded testnet run from 17 Nov 2026, not live activity. Testnet tokens have no value.</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard unavailable */
            }
          }}
        >
          {copied ? <Check className="size-4" /> : <Link2 className="size-4" />} {copied ? "Link copied" : "Copy link"}
        </Button>
      </Card>
      <ScenarioCard s={s} main />
      <Card>
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-xl">Asset movements</h2>
          <p className="text-sm text-fg-muted">Every token and NFT that moved in this loop, from the transaction receipts.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-fg-subtle">
              <tr className="border-b border-border">
                <th className="px-5 py-2 font-medium">What</th>
                <th className="px-5 py-2 font-medium">From</th>
                <th className="px-5 py-2 font-medium">To</th>
                <th className="px-5 py-2 font-medium">Transaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {MOVEMENTS[s.id].map((m) => (
                <tr key={m.what + m.tx}>
                  <td className="px-5 py-2.5 font-medium">{m.what}</td>
                  <td className="px-5 py-2.5 text-fg-muted">{m.from}</td>
                  <td className="px-5 py-2.5 text-fg-muted">{m.to}</td>
                  <td className="px-5 py-2.5">
                    <Hex value={m.tx} kind="tx" chainId={84532} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <AutomationReplay initial={s.id} />
      <Card className="p-5 text-sm">
        <div className="font-medium">Other verified loops</div>
        <ul className="mt-2 space-y-1">
          {others.map((o) => (
            <li key={o.id}>
              <Link href={`/proof/${o.id}`} className="text-accent hover:underline">
                {o.engine}: {o.title}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-fg-subtle">
          Re-verify every hop yourself:{" "}
          <a href={LINKS.judgeQuickstart} target="_blank" rel="noreferrer" className="underline">
            judge quickstart
          </a>{" "}
          · <code className="font-mono">pnpm verify:proofs</code>
        </p>
      </Card>
    </div>
  );
}
