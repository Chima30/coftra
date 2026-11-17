"use client";

import Link from "next/link";
import { Fuel } from "lucide-react";
import { useFunding } from "@/hooks/use-coftra";
import { assessFunding, ASSUMPTIONS, type HealthLevel } from "@/lib/funding";
import { fmtNative } from "@/lib/format";
import { Badge, Card, CardHeader, Skeleton } from "./ui/primitives";

const levelTone: Record<HealthLevel, "success" | "warning" | "danger"> = { ok: "success", low: "warning", blocked: "danger" };
const levelLabel: Record<HealthLevel, string> = { ok: "Funded", low: "Running low", blocked: "Blocked" };

export function useFundingAssessment() {
  const q = useFunding();
  return { ...q, assessment: q.data ? assessFunding(q.data) : undefined };
}

export function FundingSummary() {
  const { data, assessment, isLoading, error } = useFundingAssessment();
  return (
    <Card>
      <CardHeader
        title="Automation funding"
        description="Can Reactive Network keep acting?"
        action={<Link href="/settings#funding" className="text-sm text-accent hover:underline">Details</Link>}
      />
      <div className="space-y-3 px-5 py-4 text-sm">
        {isLoading ? (
          <Skeleton className="h-16" />
        ) : error || !data || !assessment ? (
          <p className="text-fg-muted">Funding data unavailable right now.</p>
        ) : (
          <>
            <Row label="Reactive execution (Lasna)" level={assessment.reactive} value={fmtNative(assessment.rcSpendable, "lREACT", 3)} />
            <Row label="Destination callbacks (Base)" level={assessment.callbacks} value={fmtNative(assessment.vaultSpendable, "ETH", 5)} />
            <p className="text-xs text-fg-subtle">
              Cron {data.cronSubscribed ? `on (${assessment.tier?.name ?? "custom"})` : "off: no open tasks, so no cron fees"} ·{" "}
              {data.openTasks.toString()} task(s) watched
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function Row({ label, level, value }: { label: string; level: HealthLevel; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-fg">{label}</div>
        <div className="tabular text-xs text-fg-muted">{value} available</div>
      </div>
      <Badge tone={levelTone[level]}>{levelLabel[level]}</Badge>
    </div>
  );
}

export function FundingDetail() {
  const { data, assessment, isLoading } = useFundingAssessment();
  if (isLoading || !data || !assessment) return <Skeleton className="h-40" />;
  return (
    <Card id="funding">
      <CardHeader title="Funding health" description="Live balances and debts, plus clearly labelled cost estimates." action={<Fuel className="size-5 text-fg-subtle" />} />
      <div className="grid gap-6 px-5 py-5 md:grid-cols-2">
        <div className="space-y-2 text-sm">
          <h3 className="font-medium">Reactive contract (Lasna)</h3>
          <KV k="Reserves at system contract (pays reactions)" v={fmtNative(data.rcReserves, "lREACT", 4)} />
          <KV k="Contract balance (not billed; move to reserves)" v={fmtNative(data.rcBalance, "lREACT", 4)} />
          <KV k="Debt to system contract" v={fmtNative(data.rcDebt, "lREACT", 4)} warn={data.rcDebt > 0n} />
          <KV k="Subscriptions" v={data.paused ? "Paused" : "Active"} warn={data.paused} />
          <KV k="Cron" v={data.cronSubscribed ? `${assessment.tier?.name} (${assessment.tier?.approx})` : "Off (nothing to watch)"} />
          <KV k="Est. cost per reaction" v={`≈ ${fmtNative(assessment.perReaction, "lREACT", 4)}`} />
          <KV k="Est. cron cost per day (now)" v={`≈ ${fmtNative(assessment.cronPerDay, "lREACT", 3)}`} />
          {assessment.runwayDays !== null && <KV k="Est. runway at current cron" v={`≈ ${assessment.runwayDays.toFixed(1)} days`} />}
        </div>
        <div className="space-y-2 text-sm">
          <h3 className="font-medium">Vault callbacks (Base Sepolia)</h3>
          <KV k="Vault native balance" v={fmtNative(data.vaultBalance, "ETH", 6)} />
          <KV k="Debt to callback proxy" v={fmtNative(data.proxyDebt, "ETH", 6)} warn={data.proxyDebt > 0n} />
          <KV k="Est. cost per callback" v={`≈ ${fmtNative(assessment.perCallback, "ETH", 8)}`} />
          {assessment.callbacksAffordable !== null && <KV k="Est. callbacks affordable" v={`≈ ${assessment.callbacksAffordable.toLocaleString()}`} />}
        </div>
      </div>
      <div className="border-t border-border px-5 py-4 text-xs leading-relaxed text-fg-subtle">
        Estimates use the documented fee formula with current gas prices and these assumptions: react() ≈ {ASSUMPTIONS.reactGas.toString()} gas
        plus {ASSUMPTIONS.extraGas.toString()} network overhead; callbacks ≈ {ASSUMPTIONS.callbackGasUsed.toString()} gas plus{" "}
        {ASSUMPTIONS.proxyOverheadGas.toString()} proxy overhead (parameters observed {ASSUMPTIONS.measuredOn}). Real costs vary with gas prices and network
        parameters; execution at a fixed price is not guaranteed. A contract with any debt stops receiving reactions or callbacks until it is repaid.
      </div>
    </Card>
  );
}

function KV({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-1.5 last:border-0">
      <span className="text-fg-muted">{k}</span>
      <span className={`tabular text-right ${warn ? "font-medium text-danger" : "text-fg"}`}>{v}</span>
    </div>
  );
}
