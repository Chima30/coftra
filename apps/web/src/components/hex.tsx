"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { explorerAddress, explorerTx } from "@/lib/chains";
import { cn, shortHex } from "@/lib/format";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`${label} ${value}`}
      className="rounded p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function Hex({
  value,
  chainId,
  kind = "address",
  full = false,
  className,
}: {
  value?: string;
  chainId?: number;
  kind?: "address" | "tx";
  full?: boolean;
  className?: string;
}) {
  if (!value) return <span className="text-fg-subtle">—</span>;
  const href = chainId ? (kind === "tx" ? explorerTx(chainId, value) : explorerAddress(chainId, value)) : undefined;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-0.5 font-mono text-[13px]", className)}>
      <span className={cn("truncate", full && "break-all whitespace-normal")} title={value}>
        {full ? value : shortHex(value, 6)}
      </span>
      <CopyButton value={value} />
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label="Open in block explorer"
          className="rounded p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </span>
  );
}
