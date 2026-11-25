"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { TaskRow } from "@/components/task-bits";
import { EmptyState, ErrorState, RequireWallet } from "@/components/states";
import { Skeleton, buttonStyles } from "@/components/ui/primitives";
import { useMyTasks } from "@/hooks/use-coftra";
import { useAccount } from "wagmi";
import { allowanceFor, incomingFor } from "@/lib/roles";
import { AllowanceCard, IncomingCard } from "@/components/role-cards";
import { ExportAllButton } from "@/components/task-story";
import { cn } from "@/lib/format";
import { TaskState } from "@/lib/protocol";

const tabs = ["Open", "Closed", "All", "Paying me", "I can spend"] as const;

export function VaultsView() {
  return (
    <>
      <PageHeader
        title="My Vaults"
        description="Every task you created or take part in, with balances read live from the vault contract."
        action={<Link href="/create" className={buttonStyles()}>New automation</Link>}
      />
      <RequireWallet why="Connect to list the tasks your address owns or is part of. Anyone can still view a task directly by its id.">
        <List />
      </RequireWallet>
    </>
  );
}

function List() {
  const { data, isLoading, error, refetch } = useMyTasks();
  const { address } = useAccount();
  const me = address ?? "";
  const [tab, setTab] = useState<(typeof tabs)[number]>("Open");
  const incoming = useMemo(() => (data?.tasks ?? []).filter((t) => incomingFor(t, me)), [data, me]);
  const spending = useMemo(() => (data?.tasks ?? []).filter((t) => allowanceFor(t, me)), [data, me]);
  const tasks = useMemo(
    () =>
      (data?.tasks ?? []).filter((t) => {
        const open = t.task.state === TaskState.Active || t.task.state === TaskState.Funded;
        return tab === "All" || (tab === "Open" ? open : !open);
      }),
    [data, tab],
  );
  if (error) return <ErrorState error={error} retry={() => refetch()} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter tasks">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              tab === t ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:text-fg",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <ExportAllButton tasks={data?.tasks ?? []} />
      </div>
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : tab === "Paying me" ? (
        incoming.length === 0 ? (
          <EmptyState title="Nobody is paying you through Coftra yet" body="When someone names your address as the recipient of a project budget, it appears here with what's promised, what's paid and what comes next." />
        ) : (
          <div className="space-y-3">{incoming.map((t) => <IncomingCard key={t.id.toString()} t={t} me={me} />)}</div>
        )
      ) : tab === "I can spend" ? (
        spending.length === 0 ? (
          <EmptyState title="No spending permissions" body="When someone lets your address spend from a session, it appears here with what's left and until when." />
        ) : (
          <div className="space-y-3">{spending.map((t) => <AllowanceCard key={t.id.toString()} t={t} me={me} />)}</div>
        )
      ) : tasks.length === 0 ? (
        <EmptyState title={tab === "Open" ? "No open tasks" : "Nothing here"} body="Tasks appear here as soon as they are created on-chain." />
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => {
            const owned = data?.owned.has(t.id.toString());
            return <TaskRow key={t.id.toString()} t={t} role={owned ? undefined : "Involved"} />;
          })}
        </div>
      )}
    </div>
  );
}
