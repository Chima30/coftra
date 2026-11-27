"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Zap, X } from "lucide-react";
import { deploymentInfo, useMyTasks } from "@/hooks/use-coftra";
import { vaultAbi } from "@/lib/contracts";
import { destinationClient } from "@/lib/wagmi";
import { useContacts } from "@/lib/contacts";
import { reactiveNotices, type ReactiveNotice } from "@/lib/toasts";
import type { StoryLog } from "@/lib/story";
import { TaskLabelText } from "./task-label";

const POLL_MS = 12_000;
const MAX_RANGE = 2_000n; // blocks per request (~7 minutes of Base Sepolia); catches up over a few polls after sleep
const SHOW_MS = 12_000;
const MAX_VISIBLE = 3;

/**
 * Vault events from the moment this tab opened, read in small block ranges. Starting at the current block
 * means nothing from the past is ever announced; only what happens while you're here.
 */
function useNewVaultLogs(enabled: boolean, onLogs: (logs: StoryLog[]) => void) {
  const cb = useRef(onLogs);
  useEffect(() => {
    cb.current = onLogs;
  });
  useEffect(() => {
    const d = deploymentInfo;
    if (!enabled || !d) return;
    let stopped = false;
    let from: bigint | null = null;
    const tick = async () => {
      try {
        const latest = await destinationClient.getBlockNumber();
        if (from === null) {
          from = latest + 1n;
          return;
        }
        if (latest < from) return;
        const to = latest - from > MAX_RANGE ? from + MAX_RANGE : latest;
        const logs = await destinationClient.getContractEvents({ address: d.vault, abi: vaultAbi, fromBlock: from, toBlock: to });
        from = to + 1n;
        if (!stopped && logs.length) cb.current(logs as unknown as StoryLog[]);
      } catch {
        /* RPC hiccup: the same range is retried on the next poll */
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [enabled]);
}

/** Small pop-ups when Reactive Network acts on one of your tasks while Coftra is open. Real chain events only. */
export function ReactiveToasts() {
  const { address } = useAccount();
  const mine = useMyTasks();
  const contacts = useContacts();
  const [notices, setNotices] = useState<(ReactiveNotice & { at: number })[]>([]);
  const seen = useRef(new Set<string>());
  const tasks = mine.data?.tasks ?? [];

  useNewVaultLogs(!!address && tasks.length > 0, (logs) => {
    const fresh = reactiveNotices(tasks, logs, address, contacts).filter((n) => !seen.current.has(n.key));
    if (fresh.length === 0) return;
    fresh.forEach((n) => seen.current.add(n.key));
    const at = Date.now();
    setNotices((cur) => [...fresh.map((n) => ({ ...n, at })), ...cur].slice(0, MAX_VISIBLE));
  });

  // Each notice dismisses itself after a while; the close button removes it at once.
  useEffect(() => {
    if (notices.length === 0) return;
    const oldest = Math.min(...notices.map((n) => n.at));
    const id = setTimeout(() => setNotices((cur) => cur.filter((n) => Date.now() - n.at < SHOW_MS)), Math.max(0, oldest + SHOW_MS - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [notices]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:w-[24rem]">
      {notices.map((n) => (
        <div
          key={n.key}
          role="status"
          className="toast-in pointer-events-auto w-full rounded-2xl border border-border bg-surface p-4 shadow-[0_16px_48px_-16px_rgb(36_36_36/0.35)]"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-mint text-[#242424]" aria-hidden>
              <Zap className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
                Reactive Network · Task #{n.taskId.toString()}
                <TaskLabelText taskId={n.taskId} />
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-fg">{n.text}</p>
              <Link
                href={`/tasks/${n.taskId}`}
                onClick={() => setNotices((cur) => cur.filter((x) => x.key !== n.key))}
                className="mt-2 inline-block text-xs text-accent underline-offset-4 hover:underline"
              >
                Open task #{n.taskId.toString()}
              </Link>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setNotices((cur) => cur.filter((x) => x.key !== n.key))}
              className="rounded-full p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
