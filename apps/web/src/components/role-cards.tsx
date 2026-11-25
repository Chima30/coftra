"use client";

import Link from "next/link";
import { ArrowDownToLine, KeyRound } from "lucide-react";
import type { TaskView } from "@/lib/reads";
import { allowanceFor, incomingFor } from "@/lib/roles";
import { fmtToken, shortHex } from "@/lib/format";
import { nameOf, useContacts } from "@/lib/contacts";
import { StateBadge } from "./task-bits";
import { TaskLabelText } from "./task-label";
import { Card } from "./ui/primitives";
import type { TaskState } from "@/lib/protocol";

/** A project budget seen from the recipient's side. */
export function IncomingCard({ t, me, linked = true, title }: { t: TaskView; me: string; linked?: boolean; title?: string }) {
  const contacts = useContacts();
  const inc = incomingFor(t, me, (a) => nameOf(contacts, a) ?? shortHex(a));
  if (!inc) return null;
  const pct = inc.promised > 0n ? Number((inc.paid * 100n) / inc.promised) : 0;
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ArrowDownToLine className="size-4 text-accent" />
        <span className="font-medium">{linked ? `Task #${t.id}` : (title ?? "You're the recipient")}</span>
        {linked && <TaskLabelText taskId={t.id} />}
        <StateBadge state={t.task.state as TaskState} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs text-fg-muted">Promised to you</div>
          <div className="tabular font-semibold">{fmtToken(inc.promised)}</div>
        </div>
        <div>
          <div className="text-xs text-fg-muted">Paid so far</div>
          <div className="tabular font-semibold">{fmtToken(inc.paid)}</div>
        </div>
        <div>
          <div className="text-xs text-fg-muted">Still to come</div>
          <div className="tabular font-semibold">{fmtToken(inc.remaining)}</div>
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-fg-muted">{inc.status}</p>
    </>
  );
  return linked ? (
    <Link href={`/tasks/${t.id}`} className="block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong">
      {body}
    </Link>
  ) : (
    <Card className="p-5">{body}</Card>
  );
}

/** A spending session seen from the executor's side. */
export function AllowanceCard({ t, me }: { t: TaskView; me: string }) {
  const contacts = useContacts();
  const a = allowanceFor(t, me, (x) => nameOf(contacts, x) ?? shortHex(x));
  if (!a) return null;
  return (
    <Link href={`/tasks/${t.id}`} className="block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="size-4 text-accent" />
        <span className="font-medium">Task #{t.id.toString()}</span>
        <TaskLabelText taskId={t.id} />
        <StateBadge state={t.task.state as TaskState} />
      </div>
      <div className="mt-2 text-sm">
        <span className="text-fg-muted">Left to spend: </span>
        <span className="tabular font-semibold">{fmtToken(a.left)}</span>
      </div>
      <p className="mt-1 text-sm text-fg-muted">{a.status}</p>
    </Link>
  );
}
