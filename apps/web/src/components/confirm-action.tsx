"use client";

import { useState } from "react";
import { Button } from "./ui/primitives";

export type ActionFacts = { who: string; funds: string; reversible: string; payouts: string; signature: string };

/**
 * A consequential vault action behind an inline confirmation that says who may do it, which funds move, whether it
 * can be undone, what happens to payouts already made, and that the wallet will ask for a signature.
 */
export function ConfirmAction({
  label,
  title,
  facts,
  confirmLabel,
  busy,
  disabled,
  variant = "secondary",
  onConfirm,
}: {
  label: string;
  title: string;
  facts: ActionFacts;
  confirmLabel: string;
  busy?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  onConfirm: () => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button variant={variant} className="w-full" disabled={busy || disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  return (
    <div className="rounded-2xl border border-warning/40 bg-warning-soft p-4 text-[13px]" role="alertdialog" aria-label={title}>
      <div className="font-medium text-warning">{title}</div>
      <dl className="mt-2 space-y-1.5 text-fg-muted">
        {(
          [
            ["Who can do this", facts.who],
            ["Funds affected", facts.funds],
            ["Can it be undone", facts.reversible],
            ["Payouts already made", facts.payouts],
            ["Signature", facts.signature],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt className="inline font-medium text-fg">{k}: </dt>
            <dd className="inline">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={variant === "danger" ? "danger" : "primary"}
          disabled={busy}
          onClick={async () => {
            await onConfirm();
            setOpen(false);
          }}
        >
          {confirmLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Keep as is
        </Button>
      </div>
    </div>
  );
}
