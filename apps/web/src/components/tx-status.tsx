"use client";

import { CheckCircle2, CircleAlert, Loader2, PenLine } from "lucide-react";
import type { Hash } from "viem";
import { destination } from "@/lib/chains";
import type { TxStatus } from "@/hooks/use-tx";
import { Hex } from "./hex";

/** Honest transaction progress: nothing is shown as successful before the receipt says so. */
export function TxStatusLine({ status, hash, error, slow }: { status: TxStatus; hash?: Hash; error?: string; slow?: boolean }) {
  if (status === "idle") return null;
  const map = {
    signing: { icon: <PenLine className="size-4" />, text: "Confirm in your wallet…", cls: "border-border bg-surface-2 text-fg-muted" },
    pending: {
      icon: <Loader2 className="size-4 animate-spin" />,
      text: slow
        ? "Still waiting after 45 s. The network may be busy, or the fee too low. It's safe to leave: the result will show from the chain."
        : "Submitted. Waiting for confirmation…",
      cls: slow ? "border-warning/30 bg-warning-soft text-warning" : "border-border bg-surface-2 text-fg-muted",
    },
    confirmed: { icon: <CheckCircle2 className="size-4" />, text: "Confirmed on-chain.", cls: "border-success/30 bg-success-soft text-success" },
    failed: { icon: <CircleAlert className="size-4" />, text: error ?? "Failed.", cls: "border-danger/30 bg-danger-soft text-danger" },
  } as const;
  const s = map[status];
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-[13px] leading-relaxed ${s.cls}`} role="status" aria-live="polite">
      {s.icon}
      <span>{s.text}</span>
      {hash && <Hex value={hash} kind="tx" chainId={destination.id} />}
    </div>
  );
}
