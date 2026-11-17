"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { ResultBadge, useActivity, type ActivityItem } from "@/components/activity-feed";
import { ProofView } from "@/components/proof-view";
import { EmptyState, ErrorState, NotDeployed } from "@/components/states";
import { Card, Notice, Skeleton } from "@/components/ui/primitives";
import { deploymentInfo } from "@/hooks/use-coftra";
import { callbackKindLabel, callbackResultCopy, CallbackKind, CallbackResult } from "@/lib/protocol";
import { cn } from "@/lib/format";

const filters = ["All", "Applied", "Not applied", "Awaiting"] as const;
type Filter = (typeof filters)[number];

function matches(i: ActivityItem, f: Filter) {
  if (f === "All") return true;
  if (f === "Awaiting") return i.status === "awaiting";
  if (i.status !== "delivered") return false;
  const r = Number((i.handled.args as { result: number }).result) as CallbackResult;
  return f === "Applied" ? r === CallbackResult.Applied : !callbackResultCopy[r].ok;
}

export function ActivityView() {
  const params = useSearchParams();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("All");
  const { items, isLoading, error, requestsError } = useActivity();
  const visible = useMemo(() => items.filter((i) => matches(i, filter)), [items, filter]);
  const selectedKey = params.get("item") ?? visible[0]?.key;
  const selected = items.find((i) => i.key === selectedKey) ?? visible[0];

  return (
    <>
      <PageHeader
        title="Automation Activity"
        description="The Proof Center. Every automated step, traced from the origin event through Reactive Network to the vault, rebuilt from chain data when you open it."
      />
      {!deploymentInfo ? (
        <NotDeployed />
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <div className="space-y-4">
          <Card className="flex gap-3 px-5 py-4 text-sm text-fg-muted">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" />
            <p>
              Each entry has three hops: an <strong className="font-medium text-fg">origin event</strong> (a verifier attestation, an NFT mint, or a
              cron tick), the <strong className="font-medium text-fg">reactive transaction</strong> on Lasna where Coftra&apos;s reactive contract asked
              for a callback, and the <strong className="font-medium text-fg">destination transaction</strong> where the vault re-checked its rules
              and recorded the result. Requests the vault rejected show the reason; requests not yet delivered are shown as awaiting, never as
              done.
            </p>
          </Card>
          {requestsError && (
            <Notice tone="warning" title="Lasna RPC unavailable">
              Showing destination-side results only. Undelivered requests can&apos;t be listed until Lasna responds.
            </Notice>
          )}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter activity">
            {filters.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  filter === f ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:text-fg",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : visible.length === 0 ? (
            <EmptyState
              title={items.length === 0 ? "No automation yet" : "Nothing matches this filter"}
              body={
                items.length === 0
                  ? "Entries appear as soon as Reactive Network delivers a callback for any Coftra task."
                  : undefined
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <Card className="h-fit overflow-hidden">
                <ul className="max-h-[70vh] divide-y divide-border overflow-auto">
                  {visible.map((i) => (
                    <li key={i.key}>
                      <button
                        onClick={() => router.replace(`/activity?item=${encodeURIComponent(i.key)}`, { scroll: false })}
                        aria-current={selected?.key === i.key}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-4 py-3 text-left",
                          selected?.key === i.key ? "bg-surface-2" : "hover:bg-surface-2",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-medium">{callbackKindLabel[i.kind]}</div>
                          <div className="text-sm text-fg-muted">
                            {i.status === "delivered"
                              ? `Task #${i.taskId}`
                              : i.kind === CallbackKind.Outcome
                                ? `Token #${i.subject}`
                                : `Task #${i.subject}`}
                          </div>
                        </div>
                        <ResultBadge item={i} />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
              {selected && <ProofView key={selected.key} item={selected} />}
            </div>
          )}
        </div>
      )}
    </>
  );
}
