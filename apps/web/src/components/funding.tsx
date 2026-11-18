"use client";

import Link from "next/link";
import { Fuel } from "lucide-react";
import { useFunding } from "@/hooks/use-coftra";
import { assessFunding, ASSUMPTIONS, OBSERVED_LREACT_PER_MIN_WHILE_OPEN, type HealthLevel } from "@/lib/funding";
import { fmtNative } from "@/lib/format";
import { callbackResultCopy, CallbackResult } from "@/lib/protocol";
import { useActivity } from "./activity-feed";
import { Badge, Card, CardHeader, Notice, Skeleton } from "./ui/primitives";

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
        description="Can Reactive Network act right now?"
        action={<Link href="/settings#funding" className="text-sm text-accent hover:underline">Details</Link>}
      />
      <div className="space-y-3 px-5 py-4 text-sm">
        {isLoading ? (
          <Skeleton className="h-16" />
        ) : error || !data || !assessment ? (
          <>
            <UnknownRow label="Reactive execution (Lasna)" />
            <UnknownRow label="Destination callbacks (Base)" />
            <p className="text-xs text-fg-subtle">Couldn&apos;t read balances from the RPCs. This is a display problem, not proof that automation is down.</p>
          </>
        ) : (
          <>
            <Row label="Reactive execution (Lasna)" level={assessment.reactive} value={`${fmtNative(assessment.rcSpendable, "lREACT", 3)} in reserves`} />
            <Row label="Destination callbacks (Base)" level={assessment.callbacks} value={`${fmtNative(assessment.vaultSpendable, "ETH", 5)} callback balance`} />
            <p className="text-xs text-fg-muted">
              Reserve covers ≈ {assessment.runwayHoursWhileOpen.toFixed(1)} h of automation while tasks are open (measured testnet rate).
            </p>
            <p className="text-xs text-fg-subtle">
              {data.openTasks > 0n
                ? `Scheduled checks running (${assessment.tier?.name ?? "cron"}) for ${data.openTasks.toString()} open task(s)`
                : "No open tasks, so no scheduled checks are needed or billed"}
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
        <div className="tabular text-xs text-fg-muted">{value}</div>
      </div>
      <Badge tone={levelTone[level]}>{levelLabel[level]}</Badge>
    </div>
  );
}

function UnknownRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-fg">{label}</div>
      <Badge>Unknown</Badge>
    </div>
  );
}

/** Counts of callbacks the vault has recorded, plus requests seen on Lasna that never arrived. */
function CallbackStats() {
  const { items, isLoading, error, requestsError } = useActivity();
  if (isLoading) return <Skeleton className="h-10" />;
  if (error) return <p className="text-sm text-fg-muted">Callback history unavailable right now.</p>;
  let applied = 0;
  let rejected = 0;
  let awaiting = 0;
  for (const i of items) {
    if (i.status === "awaiting") awaiting++;
    else {
      const r = Number((i.handled.args as { result: number }).result) as CallbackResult;
      if (r === CallbackResult.Applied || r === CallbackResult.AlreadyApplied) applied++;
      else rejected++;
    }
  }
  return (
    <div className="space-y-2 text-sm">
      <KV k="Callbacks applied by the vault" v={String(applied)} />
      <KV k="Callbacks received but not applied (with reason)" v={String(rejected)} />
      <KV k="Requested on Lasna, not yet delivered" v={requestsError ? "Unknown (Lasna RPC unavailable)" : String(awaiting)} warn={awaiting > 0} />
      <p className="text-xs text-fg-subtle">
        Past callbacks show the pipeline has worked. They don&apos;t guarantee future delivery; that also depends on funding and network availability.{" "}
        <Link href="/activity" className="underline">
          See each one
        </Link>
        .
      </p>
    </div>
  );
}

export function FundingDetail() {
  const { data, assessment, isLoading, error, refetch } = useFundingAssessment();
  return (
    <Card id="funding">
      <CardHeader
        title="Automation health"
        description="Live balances and debts on both chains, clearly labelled estimates, and what to do if something stalls."
        action={<Fuel className="size-5 text-fg-subtle" />}
      />
      {isLoading ? (
        <div className="p-5">
          <Skeleton className="h-40" />
        </div>
      ) : error || !data || !assessment ? (
        <div className="p-5">
          <Notice tone="neutral" title="Status unknown">
            The RPCs didn&apos;t answer, so funding can&apos;t be shown. Nothing is assumed healthy.{" "}
            <button className="underline" onClick={() => refetch()}>
              Try again
            </button>
          </Notice>
        </div>
      ) : (
        <div className="grid gap-6 px-5 py-5 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <h3 className="font-medium">Reactive contract (Lasna)</h3>
            <KV k="Execution reserve (what reactions are billed from)" v={fmtNative(data.rcReserves, "lREACT", 4)} />
            <KV k="Contract balance (not billed)" v={fmtNative(data.rcBalance, "lREACT", 4)} />
            <KV k="Debt to system contract" v={fmtNative(data.rcDebt, "lREACT", 4)} warn={data.rcDebt > 0n} />
            <KV k="Reactions" v={data.paused ? "Paused by operator" : "Not paused"} warn={data.paused} />
            <KV
              k="Scheduled checks needed now"
              v={data.openTasks > 0n ? `Yes, ${data.openTasks.toString()} open task(s)` : "No, nothing open"}
            />
            <KV k="Cron subscription" v={data.cronSubscribed ? `On · ${assessment.tier?.name} (${assessment.tier?.approx})` : "Off"} warn={data.openTasks > 0n && !data.cronSubscribed} />
            <KV k="Est. cost per reaction" v={`≈ ${fmtNative(assessment.perReaction, "lREACT", 4)}`} />
            <KV k="Est. cron cost per day (now)" v={`≈ ${fmtNative(assessment.cronPerDay, "lREACT", 3)}`} />
            <KV
              k="Runway while any task is open (measured)"
              v={`≈ ${assessment.runwayHoursWhileOpen.toFixed(1)} h`}
              warn={assessment.runwayHoursWhileOpen < 12}
            />
            <p className="text-xs text-fg-subtle">
              Measured on Lasna: ≈{(OBSERVED_LREACT_PER_MIN_WHILE_OPEN * 1440).toFixed(1)} lREACT per day while scheduled checks run. A reserve in
              debt pauses automation for every task until topped up; anyone can top up with depositTo on the system contract.
            </p>
            <p className="pt-1 text-xs text-fg-subtle">
              The full subscription list isn&apos;t readable over a standard RPC. Verify it with Reactive&apos;s tools or on Reactscan.
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <h3 className="font-medium">Vault callbacks (Base Sepolia)</h3>
            <KV k="Callback balance (charged per callback)" v={fmtNative(data.vaultBalance, "ETH", 6)} />
            <KV k="Debt to callback proxy" v={fmtNative(data.proxyDebt, "ETH", 6)} warn={data.proxyDebt > 0n} />
            <KV k="Est. cost per callback" v={`≈ ${fmtNative(assessment.perCallback, "ETH", 8)}`} />
            {assessment.callbacksAffordable !== null && <KV k="Est. callbacks affordable" v={`≈ ${assessment.callbacksAffordable.toLocaleString()}`} />}
            <h3 className="pt-3 font-medium">Callback history</h3>
            <CallbackStats />
          </div>
        </div>
      )}
      <div className="border-t border-border px-5 py-4 text-sm">
        <h3 className="font-medium">If automation stalls</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-muted">
          <li>Missed deadline: the reactive contract re-requests the expiry check every 5 minutes until the vault confirms. After 30 minutes anyone can press “Run fallback manually” on the task page.</li>
          <li>Milestone not paid: the verifier can attest again after a 5-minute cooldown, or the owner can use the clearly labelled owner override.</li>
          <li>Payout blocked by the token: the amount is kept as a claimable credit for the recipient.</li>
          <li>Reserve or callback debt: anyone can top up; until then reactions or callbacks are paused, but funds stay safe in the vault.</li>
        </ul>
      </div>
      <div className="border-t border-border px-5 py-4 text-xs leading-relaxed text-fg-subtle">
        Estimates use the documented fee formula with current gas prices and these assumptions: react() ≈ {ASSUMPTIONS.reactGas.toString()} gas plus{" "}
        {ASSUMPTIONS.extraGas.toString()} network overhead; callbacks ≈ {ASSUMPTIONS.callbackGasUsed.toString()} gas plus {ASSUMPTIONS.proxyOverheadGas.toString()}{" "}
        proxy overhead (parameters observed {ASSUMPTIONS.measuredOn}). These are testnet figures, not mainnet prices. Execution at a fixed price is not
        guaranteed. A contract with any debt stops receiving reactions or callbacks until it is repaid. {callbackResultCopy[CallbackResult.NotYetDue].label} results
        are normal: the vault refuses to expire a task before its own clock says so.
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
