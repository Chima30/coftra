"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { ChevronRight, CircleAlert, Hourglass, Info } from "lucide-react";
import { useMyTasks, useVerifierTasks } from "@/hooks/use-coftra";
import { useNow } from "@/hooks/use-now";
import { nameOf, useContacts } from "@/lib/contacts";
import { shortHex } from "@/lib/format";
import { nextActions } from "@/lib/next-actions";
import { Badge, Card, CardHeader, Skeleton } from "./ui/primitives";

const icons = { act: CircleAlert, wait: Hourglass, info: Info } as const;

/** One list across all open tasks: what you have to do, what you're waiting on, and what's worth knowing. */
export function NeedsYou() {
  const { address } = useAccount();
  const mine = useMyTasks();
  const known = useMemo(() => new Set((mine.data?.tasks ?? []).map((t) => t.id.toString())), [mine.data]);
  const verifying = useVerifierTasks(known);
  const contacts = useContacts();
  const now = useNow(30_000);

  const items = useMemo(() => {
    if (!address || now === 0) return [];
    const all = [...(mine.data?.tasks ?? []), ...(verifying.data ?? [])];
    return nextActions(all, address, now, (a) => nameOf(contacts, a) ?? shortHex(a));
  }, [address, mine.data, verifying.data, contacts, now]);

  return (
    <Card>
      <CardHeader title="What needs you" description="Open tasks, most urgent first. Includes tasks where you're a verifier." />
      {mine.isLoading || now === 0 ? (
        <div className="p-5"><Skeleton className="h-16" /></div>
      ) : items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-fg-muted">Nothing needs you right now. Open tasks run on their own.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((a, i) => {
            const Icon = icons[a.tone];
            return (
              <li key={`${a.taskId}-${i}`}>
                <Link href={`/tasks/${a.taskId}`} className="flex items-start gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                  <Icon className={a.tone === "act" ? "mt-0.5 size-4 shrink-0 text-warning" : "mt-0.5 size-4 shrink-0 text-fg-subtle"} />
                  <span className="min-w-0 flex-1 leading-relaxed">
                    {a.text}
                    {a.soon && <Badge tone="warning" className="ml-2">Soon</Badge>}
                  </span>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
