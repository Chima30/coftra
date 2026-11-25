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

function checkText(check?: ReceiptCheck) {
  if (!check) return "Checking…";
  if (check.state === "confirmed") return "Re-checked";
  if (check.state === "reverted") return "Reverted";
  return "Open on explorer";
}

function CheckLabel({ check }: { check?: ReceiptCheck }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
      <CheckIcon check={check} />
      {checkText(check)}
    </span>
  );
}

/** Summary line that never claims more than the live re-check actually established. */
export function RecheckBanner() {
  const { data, isLoading, isError } = useEvidenceCheck();
  const values = Object.values(data ?? {});
  const ok = values.filter((v) => v.state === "confirmed").length;
  const unavailable = values.filter((v) => v.state === "unavailable").length;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]" role="status" aria-live="polite">
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

type Stage = {
  n: string;
  name: string;
  chainId?: number;
  label?: string;
  detail: string;
  hash?: `0x${string}`;
  check?: ReceiptCheck;
  note?: string;
  tint: string;
};

/**
 * Five readable stages from the recorded three-transaction loop. The callback request is an event inside the
 * Reactive transaction, so it points at that same hash and says so; nothing here is invented.
 */
function stagesOf(s: Scenario, data?: Record<string, ReceiptCheck>): Stage[] {
  const [origin, reactive, callback] = s.hops;
  return [
    { n: "01", name: "Origin event", chainId: origin.chainId, label: origin.label, detail: origin.detail, hash: origin.hash, check: data?.[origin.hash], tint: "bg-periwinkle" },
    { n: "02", name: "Reactive execution", chainId: reactive.chainId, label: reactive.label, detail: reactive.detail, hash: reactive.hash, check: data?.[reactive.hash], tint: "bg-sky" },
    {
      n: "03",
      name: "Callback request",
      chainId: reactive.chainId,
      detail: "The reactive contract asks Reactive Network to call the vault on Base Sepolia.",
      hash: reactive.hash,
      check: data?.[reactive.hash],
      note: "Emitted inside the Reactive transaction above",
      tint: "bg-sky",
    },
    { n: "04", name: "Destination transaction", chainId: callback.chainId, label: callback.label, detail: callback.detail, hash: callback.hash, check: data?.[callback.hash], tint: "bg-mint" },
    { n: "05", name: "Verified outcome", detail: s.outcome.join(" "), tint: "bg-gold" },
  ];
}

function StageCard({ st, gas }: { st: Stage; gas?: ReceiptCheck }) {
  return (
    <li className="relative flex min-w-0 flex-col rounded-3xl border border-border bg-bg p-4">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("flex size-8 items-center justify-center rounded-full text-[11px] font-medium text-[#242424]", st.tint)}>{st.n}</span>
        {st.chainId && <Badge>{chainName(st.chainId)}</Badge>}
      </div>
      <h4 className="mt-3 font-display text-xl leading-tight text-fg">{st.name}</h4>
      {st.label && <div className="mt-1 text-[12px] font-medium text-fg">{st.label}</div>}
      <p className="mt-1 text-[12px] leading-relaxed text-fg-muted [overflow-wrap:anywhere]">{st.detail}</p>
      {st.hash && (
        <div className="mt-auto space-y-1.5 pt-3">
          <Hex value={st.hash} kind="tx" chainId={st.chainId} />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <CheckLabel check={st.check} />
            {st.note && <span className="text-[11px] text-fg-subtle">· {st.note}</span>}
          </div>
          {!st.note && gas?.state === "confirmed" && (
            <div className="text-[11px] text-fg-subtle">
              {gas.gasUsed.toLocaleString()} gas{gas.feeWei !== null ? ` · ${fmtNative(gas.feeWei, "ETH", 9)}` : " · fee billed to reserves"}
            </div>
          )}
        </div>
      )}
      {!st.hash && (
        <div className="mt-auto pt-3 text-[11px] text-success">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-4" aria-hidden /> Result of the transactions above
          </span>
        </div>
      )}
    </li>
  );
}

export function ScenarioCard({ s, main = false }: { s: Scenario; main?: boolean }) {
  // On its own page the scenario title is the page heading.
  const Title = main ? "h1" : "h3";
  const { data } = useEvidenceCheck();
  const stages = stagesOf(s, data);
  return (
    <Card id={s.id} className="scroll-mt-24 rounded-[32px] p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={engineTone[s.engine]}>
          <span className="font-mono tracking-[0.12em]">{s.engine}</span>
        </Badge>
        <span className="text-xs text-fg-subtle">Task #{s.taskId}</span>
        <span className="flex items-center gap-1 text-xs text-fg-subtle">
          <Clock3 className="size-3" aria-hidden /> origin → callback ≈ {s.latencySeconds}s
        </span>
      </div>
      <Title className="mt-4 text-[32px] leading-tight sm:text-4xl">{s.title}</Title>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-muted">{s.summary}</p>

      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Verified pipeline">
        {stages.map((st) => (
          <StageCard key={st.n} st={st} gas={st.check} />
        ))}
      </ol>

      <div className="mt-6 grid gap-5 border-t border-border pt-5 text-[13px] lg:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-fg-subtle">Task setup</div>
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
          {s.caveat && <p className="text-xs text-fg-subtle">Note: {s.caveat}</p>}
        </div>
        <div className="flex flex-wrap items-start gap-2 lg:flex-col lg:items-end">
          <Link href={`/tasks/${s.taskId}`} className={buttonStyles({ size: "sm" })}>
            Open task #{s.taskId} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          <Link href={`/proof/${s.id}`} className={buttonStyles({ variant: "ghost", size: "sm" })}>
            Shareable link
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
      <div className="flex flex-col gap-3 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-[26px]">Verified automations</h2>
          <p className="mt-1 text-[13px] text-fg-muted">Four complete loops recorded on testnet. Every hash opens on its explorer.</p>
        </div>
        <Link href="/proof" className={buttonStyles({ variant: "secondary", size: "sm" })}>
          Full walkthrough
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {SCENARIOS.map((s) => (
          <li key={s.id} className="px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium tracking-[0.14em] text-fg-subtle">{s.engine}</span>
              <span className="font-display text-lg leading-tight">{s.title}</span>
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

