"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, Link2 } from "lucide-react";
import { RecheckBanner, ScenarioCard } from "@/components/verified";
import { Button, Card } from "@/components/ui/primitives";
import { LINKS, SCENARIOS } from "@/lib/evidence";

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
      <ScenarioCard s={s} />
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
