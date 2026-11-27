"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Activity, CircleAlert } from "lucide-react";
import { useFundingAssessment } from "./funding";
import { useVaultLogs } from "@/hooks/use-coftra";
import { useNow } from "@/hooks/use-now";
import { HEALTH_TONE, healthTotals, refusedCallbacks, taskHealth, type HealthLabel, type TaskHealth } from "@/lib/health";
import type { TaskView } from "@/lib/reads";
import { fmtDate, fmtToken, relTime } from "@/lib/format";
import type { CallbackResult } from "@/lib/protocol";
import { Badge, Card, CardHeader, Skeleton, Stat } from "./ui/primitives";

/** Everything Task Health reads: the clock, the automation funding reading and each task's callback results. */
export function useHealthInputs() {
  const now = useNow(30_000);
  const funding = useFundingAssessment();
  const logs = useVaultLogs();
  const results = useMemo(() => {
    const m = new Map<string, CallbackResult[]>();
    for (const l of logs.data ?? []) {
      if (l.eventName !== "ReactiveCallbackHandled") continue;
      const a = l.args as { taskId?: bigint; result?: number };
      if (a.taskId === undefined) continue;
      const k = a.taskId.toString();
      m.set(k, [...(m.get(k) ?? []), Number(a.result) as CallbackResult]);
    }
    return m;
  }, [logs.data]);
  const fundingLevels = funding.assessment ? { reactive: funding.assessment.reactive, callbacks: funding.assessment.callbacks } : undefined;
  const readAt = Math.max(funding.dataUpdatedAt || 0, logs.dataUpdatedAt || 0);
  const healthOf = (t: TaskView): TaskHealth =>
    taskHealth(t, { now, funding: fundingLevels, callbacks: logs.data ? (results.get(t.id.toString()) ?? []) : undefined });
  return { now, healthOf, readAt, loading: funding.isLoading || logs.isLoading, results, logsReady: !!logs.data };
}

export function HealthBadge({ h }: { h: TaskHealth }) {
  return (
    <Badge tone={h.tone}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {h.label}
    </Badge>
  );
}

function ReadAt({ at }: { at: number }) {
  return (
    <span className="text-xs text-fg-subtle">
      {at ? `Read from the chains at ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Not read yet"}
    </span>
  );
}

/** Task page: one status and the reasons behind it. */
export function TaskHealthCard({ t }: { t: TaskView }) {
  const { healthOf, readAt, loading } = useHealthInputs();
  const h = healthOf(t);
  return (
    <Card>
      <CardHeader title="Task health" description="Worked out from the vault's state, this task's callbacks and the automation funding. No scores, no guesses." action={<HealthBadge h={h} />} />
      <div className="space-y-2 px-5 py-4 text-[13px] sm:px-6">
        {loading && h.label === "Status unknown" ? (
          <Skeleton className="h-10" />
        ) : (
          <ul className="space-y-1.5">
            {h.reasons.map((r) => (
              <li key={r} className="flex gap-2.5 leading-relaxed">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-fg-subtle" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        )}
        <ReadAt at={readAt} />
      </div>
    </Card>
  );
}

const ORDER: HealthLabel[] = ["Recovery available", "Funding warning", "Attention needed", "Expiring soon", "Status unknown", "Healthy", "Completed", "Expired", "Cancelled"];

/** Overview: what the vault holds for your tasks, what needs you, and what comes next. */
export function TaskHealthSummary({ tasks }: { tasks: TaskView[] }) {
  const { healthOf, readAt, loading, results, logsReady } = useHealthInputs();
  const health = useMemo(() => new Map(tasks.map((t) => [t.id, healthOf(t)])), [tasks, healthOf]);
  const totals = healthTotals(tasks, health);
  const refused = logsReady ? tasks.reduce((s, t) => s + refusedCallbacks(results.get(t.id.toString()) ?? []), 0) : null;
  const needs = tasks.filter((t) => ["Recovery available", "Funding warning", "Attention needed", "Expiring soon"].includes(health.get(t.id)!.label));
  return (
    <Card>
      <CardHeader
        title="Task health"
        description="Your tasks, read from the vault. Amounts are tUSDC, the only token the vault accepts today."
        action={<Activity className="size-5 text-fg-subtle" aria-hidden />}
      />
      <div className="grid grid-cols-2 gap-5 px-5 py-4 sm:px-6 md:grid-cols-4">
        <Stat label="Open tasks" value={totals.open} />
        <Stat label="Still in the vault" value={fmtToken(totals.allocated)} />
        <Stat label="Reserved for payouts" value={fmtToken(totals.reserved)} sub="checkpoints and spending caps" />
        <Stat label="Refused callbacks" value={refused === null ? "—" : refused} sub={refused === null ? "couldn't read the logs" : "for your tasks, all time"} />
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3 sm:px-6">
        {ORDER.filter((l) => totals.byLabel[l]).map((l) => (
          <Badge key={l} tone={HEALTH_TONE[l]}>
            {l} · {totals.byLabel[l]}
          </Badge>
        ))}
        {tasks.length === 0 && <span className="text-[13px] text-fg-muted">No tasks yet.</span>}
      </div>
      {needs.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {needs.map((t) => {
            const h = health.get(t.id)!;
            return (
              <li key={t.id.toString()}>
                <Link href={`/tasks/${t.id}`} className="flex items-start gap-3 px-5 py-3 text-[13px] hover:bg-surface-2 sm:px-6">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">Task #{t.id.toString()}</span> · {h.reasons[0]}
                  </span>
                  <HealthBadge h={h} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs text-fg-muted sm:px-6">
        <span>
          {totals.nextDeadlines.length
            ? `Next deadline${totals.nextDeadlines.length > 1 ? "s" : ""}: ${totals.nextDeadlines.map((d) => `#${d.id} ${relTime(d.deadline)} (${fmtDate(d.deadline)})`).join(" · ")}`
            : "No open deadlines."}
        </span>
        {loading ? <Skeleton className="h-4 w-40" /> : <ReadAt at={readAt} />}
      </div>
    </Card>
  );
}
