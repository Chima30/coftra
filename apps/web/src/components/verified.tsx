"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDashed, Clock3, ExternalLink, XCircle } from "lucide-react";
import { SCENARIOS, type Scenario } from "@/lib/evidence";
import { chainName, explorerTx } from "@/lib/chains";
import { fmtNative } from "@/lib/format";
import { useEvidenceCheck, type ReceiptCheck } from "@/hooks/use-evidence";
import { Hex } from "./hex";
import { Badge, Card, buttonStyles } from "./ui/primitives";
import { cn } from "@/lib/format";

const engineTone = { CHECKPOINT: "accent", CLOSEOUT: "success", FALLBACK: "warning" } as const;

export function CheckIcon({ check }: { check?: ReceiptCheck }) {
  if (!check) return <CircleDashed className="size-4 shrink-0 animate-pulse text-fg-subtle" aria-label="Checking" />;
  if (check.state === "confirmed") return <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Confirmed on-chain just now" />;
  if (check.state === "reverted") return <XCircle className="size-4 shrink-0 text-danger" aria-label="Reverted" />;
  return <CircleDashed className="size-4 shrink-0 text-fg-subtle" aria-label="Couldn't re-check right now" />;
}

/** Summary line that never claims more than the live re-check actually established. */
export function RecheckBanner() {
  const { data, isLoading, isError } = useEvidenceCheck();
  const values = Object.values(data ?? {});
  const ok = values.filter((v) => v.state === "confirmed").length;
  const unavailable = values.filter((v) => v.state === "unavailable").length;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" role="status" aria-live="polite">
      {isLoading ? (
        <>
          <CircleDashed className="size-4 animate-pulse text-fg-subtle" /> Re-checking every transaction on Base Sepolia and Reactive Lasna…
        </>
      ) : isError || values.length === 0 ? (
        <>
          <CircleDashed className="size-4 text-fg-subtle" /> Couldn&apos;t reach the RPCs right now. Every hash below still opens on its block explorer.
        </>
      ) : (
        <>
          <CheckCircle2 className={cn("size-4", unavailable ? "text-warning" : "text-success")} />
          {ok} of {values.length} transactions re-checked on-chain just now
          {unavailable > 0 && <span className="text-fg-muted">({unavailable} couldn&apos;t be fetched; open them on the explorer)</span>}
        </>
      )}
    </div>
  );
}

function HopRow({ hop, check, last }: { hop: Scenario["hops"][number]; check?: ReceiptCheck; last: boolean }) {
  return (
    <li className="relative pl-7">
      <span className="absolute left-0 top-0.5">
        <CheckIcon check={check} />
      </span>
      {!last && <span className="absolute left-[7px] top-6 h-[calc(100%-12px)] w-px bg-border" aria-hidden />}
      <div className="pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{hop.label}</span>
          <Badge>{chainName(hop.chainId)}</Badge>
        </div>
        <div className="mt-0.5 text-[13px] text-fg-muted">{hop.detail}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[13px]">
          <Hex value={hop.hash} kind="tx" chainId={hop.chainId} />
          {check?.state === "confirmed" && (
            <span className="text-xs text-fg-subtle">
              {check.gasUsed.toLocaleString()} gas{check.feeWei !== null ? ` · ${fmtNative(check.feeWei, "ETH", 9)}` : " · fee billed to reserves"}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

export function ScenarioCard({ s }: { s: Scenario }) {
  const { data } = useEvidenceCheck();
  return (
    <Card id={s.id} className="scroll-mt-20 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={engineTone[s.engine]}>
          <span className="font-mono">{s.engine}</span>
        </Badge>
        <span className="text-xs text-fg-subtle">Task #{s.taskId}</span>
        <span className="flex items-center gap-1 text-xs text-fg-subtle">
          <Clock3 className="size-3" /> origin → callback ≈ {s.latencySeconds}s
        </span>
      </div>
      <h3 className="mt-2 text-base font-semibold">{s.title}</h3>
      <p className="mt-1 text-sm text-fg-muted">{s.summary}</p>

      <div className="mt-4 grid gap-5 lg:grid-cols-[260px_1fr]">
        <div className="space-y-3 text-[13px]">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Task setup</div>
            <ul className="mt-1.5 space-y-1 text-fg-muted">
              {s.config.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          {s.setup?.map((x) => (
            <div key={x.hash} className="flex flex-wrap items-center gap-2 text-fg-muted">
              <CheckIcon check={data?.[x.hash]} /> {x.label}
              <Hex value={x.hash} kind="tx" chainId={84532} />
            </div>
          ))}
        </div>
        <div>
          <ol>
            {s.hops.map((h, i) => (
              <HopRow key={h.hash} hop={h} check={data?.[h.hash]} last={i === s.hops.length - 1} />
            ))}
          </ol>
          <div className="rounded-md border border-border bg-surface-2 p-3 text-[13px]">
            <div className="font-medium">Outcome</div>
            <ul className="mt-1 space-y-0.5 text-fg-muted">
              {s.outcome.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
          {s.caveat && <p className="mt-2 text-xs text-fg-subtle">Note: {s.caveat}</p>}
          <Link href={`/tasks/${s.taskId}`} className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">
            Open task #{s.taskId} with its live history <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </Card>
  );
}

/** Compact version for Automation Activity: one row per verified loop, no wallet needed. */
export function VerifiedShowcase() {
  const { data } = useEvidenceCheck();
  return (
    <Card>
      <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">Verified automations</h2>
          <p className="mt-0.5 text-sm text-fg-muted">Four complete loops recorded on testnet. Every hash opens on its explorer.</p>
        </div>
        <Link href="/proof" className={buttonStyles({ variant: "secondary", size: "sm" })}>
          Full walkthrough
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {SCENARIOS.map((s) => (
          <li key={s.id} className="px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-medium">{s.engine}</span>
              <span className="text-sm">{s.title}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-muted">
              {s.hops.map((h, i) => (
                <span key={h.hash} className="inline-flex items-center gap-1">
                  <CheckIcon check={data?.[h.hash]} />
                  <a href={explorerTx(h.chainId, h.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg hover:underline">
                    {["Origin", "Reactive", "Callback"][i]} <span className="font-mono">{h.hash.slice(0, 8)}…</span>
                    <ExternalLink className="size-3" />
                  </a>
                  {i < 2 && <ArrowRight className="size-3 text-fg-subtle" aria-hidden />}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

