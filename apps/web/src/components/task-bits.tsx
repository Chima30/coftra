"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import type { TaskView } from "@/lib/reads";
import { kindLabel, stateCopy, TaskKind, TaskState } from "@/lib/protocol";
import { fmtToken, relTime, cn } from "@/lib/format";
import { Badge } from "./ui/primitives";
import { TaskLabelText } from "./task-label";

export function StateBadge({ state }: { state: TaskState }) {
  const s = stateCopy[state];
  return (
    <Badge tone={s.tone}>
      <span className={cn("size-1.5 rounded-full bg-current", state === TaskState.Active && "motion-safe:animate-pulse")} aria-hidden />
      {s.label}
    </Badge>
  );
}

/** Stacked bar: released / reserved / free. Values straight from the vault. */
export function FundsBar({ t }: { t: TaskView }) {
  const dep = t.task.deposited;
  if (dep === 0n) return null;
  const pct = (v: bigint) => Number((v * 10000n) / dep) / 100;
  const released = pct(t.task.released);
  const refunded = pct(t.task.refunded);
  const reserved = pct(t.reserved);
  return (
    <div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="bg-accent" style={{ width: `${released}%` }} />
        <div className="bg-info/60" style={{ width: `${reserved}%` }} />
        <div className="bg-fg-subtle/40" style={{ width: `${refunded}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span><span className="mr-1 inline-block size-2 rounded-sm bg-accent" />Released {fmtToken(t.task.released)}</span>
        {t.reserved > 0n && <span><span className="mr-1 inline-block size-2 rounded-sm bg-info/60" />Reserved {fmtToken(t.reserved)}</span>}
        {t.task.refunded > 0n && <span><span className="mr-1 inline-block size-2 rounded-sm bg-fg-subtle/40" />Returned {fmtToken(t.task.refunded)}</span>}
      </div>
    </div>
  );
}

export function TaskRow({ t, role }: { t: TaskView; role?: string }) {
  const state = t.task.state as TaskState;
  const progress =
    t.task.kind === TaskKind.ProjectBudget
      ? `${t.task.milestonesDone}/${t.task.milestoneCount} checkpoints`
      : `${t.session.executions} execution${t.session.executions === 1 ? "" : "s"}`;
  return (
    <Link
      href={`/tasks/${t.id}`}
      className="group block rounded-lg border border-border bg-surface px-5 py-4 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-fg">Task #{t.id.toString()}</span>
            <TaskLabelText taskId={t.id} />
            <StateBadge state={state} />
            {role && <Badge>{role}</Badge>}
          </div>
          <div className="mt-1 text-sm text-fg-muted">
            {kindLabel[t.task.kind as TaskKind]} · {progress}
          </div>
        </div>
        <div className="flex items-center gap-2 text-right">
          <div>
            <div className="tabular font-semibold text-fg">{fmtToken(t.task.deposited)}</div>
            <div className="mt-0.5 flex items-center justify-end gap-1 text-xs text-fg-subtle">
              <CalendarClock className="size-3" />
              {state === TaskState.Active || state === TaskState.Funded ? `Deadline ${relTime(t.task.deadline)}` : `Closed ${relTime(t.task.closedAt)}`}
            </div>
          </div>
          <ChevronRight className="size-4 text-fg-subtle group-hover:text-fg" />
        </div>
      </div>
      <div className="mt-3">
        <FundsBar t={t} />
      </div>
    </Link>
  );
}
