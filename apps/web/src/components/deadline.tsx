"use client";

import { CalendarPlus, Timer } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { TaskState } from "@/lib/protocol";
import { Button } from "./ui/primitives";

function fmtLeft(sec: number) {
  if (sec <= 0) return "passed";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

const icsDate = (ts: number) => new Date(ts * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Builds a calendar file entirely in the browser; nothing is sent anywhere. */
function downloadIcs(taskId: bigint, deadline: number, label: string) {
  const url = `${window.location.origin}/tasks/${taskId}`;
  const title = `Coftra task #${taskId}${label ? ` (${label})` : ""}: deadline`;
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Coftra//Task deadline//EN",
    "BEGIN:VEVENT",
    `UID:coftra-task-${taskId}-${deadline}@coftra`,
    `DTSTAMP:${icsDate(Math.floor(Date.now() / 1000))}`,
    `DTSTART:${icsDate(deadline)}`,
    `DTEND:${icsDate(deadline + 900)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:Reactive Network will expire the task shortly after this time if it isn't finished. Check the result: ${url}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${title}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([body], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `coftra-task-${taskId}-deadline.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function DeadlineCountdown({ taskId, deadline, state, label }: { taskId: bigint; deadline: number; state: TaskState; label: string }) {
  const now = useNow(1000);
  const open = state === TaskState.Active || state === TaskState.Funded;
  if (!open || now === 0) return null;
  const left = deadline - now;
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Timer className="size-4 text-fg-subtle" />
        <span className="text-fg-muted">Deadline</span>
        <span className="tabular ml-auto font-semibold" aria-live="off">
          {left > 0 ? `in ${fmtLeft(left)}` : "passed"}
        </span>
      </div>
      <p className="text-xs text-fg-subtle">
        {left > 0
          ? "If the task isn't finished by then, a Reactive Cron check expires it within a few minutes and refunds the unspent balance."
          : "Waiting for the next Reactive Cron check (usually a few minutes). Manual fallback opens 30 minutes after the deadline."}
      </p>
      {left > 0 && (
        <Button size="sm" variant="secondary" className="w-full" onClick={() => downloadIcs(taskId, deadline, label)}>
          <CalendarPlus className="size-4" /> Add deadline to my calendar
        </Button>
      )}
    </div>
  );
}
