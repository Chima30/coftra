"use client";

import { useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { SCENARIOS } from "@/lib/evidence";
import { REPLAY } from "@/lib/evidence-replay";
import { chainName } from "@/lib/chains";
import { cn } from "@/lib/format";
import { useEvidenceCheck } from "@/hooks/use-evidence";
import { CheckIcon } from "./verified";
import { Hex } from "./hex";
import { Badge, Button, Card } from "./ui/primitives";

const tabLabel = (id: string, engine: string) =>
  engine === "CLOSEOUT" ? (id.startsWith("session") ? "Session CLOSEOUT" : "Project CLOSEOUT") : engine;

/** Step-by-step replay of the four recorded loops. Uses recorded evidence only; sends nothing. */
export function AutomationReplay({ initial = "checkpoint" }: { initial?: string }) {
  const [id, setId] = useState(initial);
  const [step, setStep] = useState(0);
  const { data: checks } = useEvidenceCheck();
  const s = SCENARIOS.find((x) => x.id === id) ?? SCENARIOS[0];
  const states = REPLAY[s.id];
  const before = step === 0 ? null : states[step - 1];
  const rows = states[step];
  const hop = step === 0 ? null : s.hops[step - 1];
  const last = 3;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") setStep((x) => Math.min(last, x + 1));
    if (e.key === "ArrowLeft") setStep((x) => Math.max(0, x - 1));
  };

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <History className="size-4 text-accent" />
          <h2 className="text-xl">Replay a verified automation</h2>
          <Badge>Recorded testnet run · 17 Nov 2026</Badge>
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Step through what actually happened on-chain. This replays recorded transactions; it doesn&apos;t send anything or need a wallet.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Workflow">
          {SCENARIOS.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={x.id === s.id}
              onClick={() => {
                setId(x.id);
                setStep(0);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                x.id === s.id ? "border-fg bg-fg text-bg" : "border-border text-fg-muted hover:border-fg/40 hover:text-fg",
              )}
            >
              {tabLabel(x.id, x.engine)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 p-5 md:grid-cols-[1fr_280px]" tabIndex={0} onKeyDown={onKey} aria-label="Replay steps; use the left and right arrow keys">
        <div className="min-w-0">
          <ol className="mb-4 flex items-center gap-1.5" aria-label="Progress">
            {["Setup", "Origin event", "Reactive", "Callback"].map((label, i) => (
              <li key={label} className="flex flex-1 items-center gap-1.5">
                <button
                  onClick={() => setStep(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "w-full rounded-xl border px-2 py-1.5 text-xs",
                    i === step ? "border-fg bg-fg text-bg" : i < step ? "border-border text-fg" : "border-border text-fg-subtle",
                  )}
                >
                  {i + 1}. {label}
                </button>
              </li>
            ))}
          </ol>

          <div aria-live="polite" className="min-h-[150px]">
            {step === 0 ? (
              <>
                <div className="text-sm font-medium">{s.title}</div>
                <p className="mt-1 text-sm text-fg-muted">{s.summary}</p>
                <ul className="mt-3 space-y-1 text-[13px] text-fg-muted">
                  {s.config.map((c) => (
                    <li key={c}>· {c}</li>
                  ))}
                </ul>
              </>
            ) : (
              hop && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckIcon check={checks?.[hop.hash]} />
                    <span className="text-sm font-medium">{hop.label}</span>
                    <Badge>{chainName(hop.chainId)}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-fg-muted">{hop.detail}</p>
                  <div className="mt-2 text-sm">
                    <Hex value={hop.hash} kind="tx" chainId={hop.chainId} />
                  </div>
                  <p className="mt-3 text-[13px] text-fg-subtle">
                    {step === 1 && "Something happens on a contract Coftra only watches. Nobody has to tell Coftra about it."}
                    {step === 2 && "Coftra's reactive contract on Reactive Lasna matched the event and asked for a callback. No balances change yet."}
                    {step === 3 && `The vault re-checked its own rules and applied the result, ${s.latencySeconds}s after the origin event (block timestamps).`}
                  </p>
                </>
              )
            )}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button variant="secondary" size="sm" disabled={step === 0} onClick={() => setStep((x) => x - 1)}>
              <ChevronLeft className="size-4" /> Back
            </Button>
            <span className="text-xs text-fg-subtle">
              Step {step + 1} of {last + 1}
            </span>
            <Button size="sm" disabled={step === last} onClick={() => setStep((x) => x + 1)}>
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{step === 0 ? "State before" : "State after this step"}</div>
          <dl className="mt-2 space-y-1.5 text-[13px]">
            {rows.map((r, i) => {
              const changed = before && before[i]?.value !== r.value;
              return (
                <div key={r.label} className="flex justify-between gap-3">
                  <dt className="text-fg-muted">{r.label}</dt>
                  <dd className={cn("text-right", changed ? "font-medium text-accent" : "text-fg")}>
                    {r.value}
                    {changed && <span className="sr-only"> (changed)</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
          {step === last && (
            <a href={`/proof/${s.id}`} className="mt-3 inline-block text-xs text-accent hover:underline">
              Open the full receipt →
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}
