"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReactiveRequests, useVaultLogs } from "@/hooks/use-coftra";
import { destinationClient, lasnaClient } from "@/lib/wagmi";
import { callbackKindLabel, callbackResultCopy, CallbackKind, CallbackResult } from "@/lib/protocol";
import type { HandledLog } from "@/lib/proof";
import type { ReactiveRequestLog, VaultLog } from "@/lib/reads";
import { relTime } from "@/lib/format";
import { Badge, Skeleton } from "./ui/primitives";

export type ActivityItem =
  | { status: "delivered"; key: string; kind: CallbackKind; taskId: bigint; handled: HandledLog; request?: ReactiveRequestLog }
  | { status: "awaiting"; key: string; kind: CallbackKind; subject: bigint; request: ReactiveRequestLog };

const keyOf = (origin: bigint, kind: number, taskId?: bigint) =>
  `${origin.toString(16)}-${kind}${kind === CallbackKind.Expiry ? `-${taskId}` : ""}`;

/** Join Lasna requests with vault results. Unmatched requests are shown as awaiting, never as success. */
export function useActivity(taskId?: bigint) {
  const logs = useVaultLogs();
  const reqs = useReactiveRequests();
  const items = useMemo(() => {
    const handled = (logs.data ?? []).filter((l): l is HandledLog => (l as VaultLog).eventName === "ReactiveCallbackHandled");
    const byKey = new Map<string, ReactiveRequestLog>();
    for (const r of reqs.data ?? []) {
      byKey.set(keyOf(r.args.originTxHash!, Number(r.args.kind), r.args.subject), r);
    }
    const out: ActivityItem[] = [];
    const seen = new Set<string>();
    for (const h of handled) {
      const a = h.args as { taskId: bigint; kind: number; originTxHash: bigint };
      const k = keyOf(a.originTxHash, a.kind, a.taskId);
      seen.add(k);
      out.push({ status: "delivered", key: `${k}-${h.transactionHash}-${h.logIndex}`, kind: a.kind, taskId: a.taskId, handled: h, request: byKey.get(k) });
    }
    for (const [k, r] of byKey) {
      if (!seen.has(k)) out.push({ status: "awaiting", key: k, kind: Number(r.args.kind), subject: r.args.subject!, request: r });
    }
    const filtered =
      taskId === undefined
        ? out
        : out.filter((i) => (i.status === "delivered" ? i.taskId === taskId : i.kind !== CallbackKind.Outcome && i.subject === taskId));
    return filtered.reverse();
  }, [logs.data, reqs.data, taskId]);
  return { items, isLoading: logs.isLoading, error: logs.error ?? reqs.error, requestsError: reqs.error };
}

export function useBlockTime(chain: "dest" | "lasna", blockNumber?: bigint) {
  return useQuery({
    queryKey: ["blockTime", chain, blockNumber?.toString()],
    enabled: blockNumber !== undefined,
    staleTime: Infinity,
    queryFn: async () => {
      const c = chain === "dest" ? destinationClient : lasnaClient;
      const b = await c.getBlock({ blockNumber: blockNumber! });
      return b.timestamp;
    },
  });
}

export function ResultBadge({ item }: { item: ActivityItem }) {
  if (item.status === "awaiting") return <Badge tone="info">Awaiting delivery</Badge>;
  const r = Number((item.handled.args as { result: number }).result) as CallbackResult;
  const c = callbackResultCopy[r];
  return <Badge tone={r === CallbackResult.Applied ? "success" : c.ok ? "neutral" : r === CallbackResult.NotYetDue ? "info" : "warning"}>{c.label}</Badge>;
}

function When({ item }: { item: ActivityItem }) {
  const isDest = item.status === "delivered";
  const { data } = useBlockTime(isDest ? "dest" : "lasna", isDest ? item.handled.blockNumber : item.request.blockNumber);
  return <span className="text-xs text-fg-subtle">{data ? relTime(data) : "…"}</span>;
}

export function RecentActivity({ limit = 5, taskId }: { limit?: number; taskId?: bigint }) {
  const { items, isLoading } = useActivity(taskId);
  if (isLoading) return <div className="p-5"><Skeleton className="h-16" /></div>;
  if (items.length === 0)
    return <p className="px-5 py-6 text-sm text-fg-muted">No reactive callbacks yet. They appear here once Reactive Network acts on an event.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.slice(0, limit).map((i) => (
        <li key={i.key}>
          <Link href={`/activity?item=${encodeURIComponent(i.key)}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
            <div className="min-w-0">
              <div className="font-mono text-xs font-medium">{callbackKindLabel[i.kind]}</div>
              <div className="text-sm text-fg-muted">
                {i.status === "delivered" ? `Task #${i.taskId}` : i.kind === CallbackKind.Outcome ? `Token #${i.subject}` : `Task #${i.subject}`}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <ResultBadge item={i} />
              <When item={i} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
