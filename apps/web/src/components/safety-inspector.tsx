"use client";

import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import type { Finding } from "@/lib/inspect";
import { Card, CardHeader } from "./ui/primitives";

export function SafetyInspector({ findings }: { findings: Finding[] }) {
  const warnings = findings.filter((f) => f.level === "warning");
  const notes = findings.filter((f) => f.level === "note");
  return (
    <Card>
      <CardHeader
        title="Safety inspector"
        description={
          warnings.length
            ? `${warnings.length} warning${warnings.length > 1 ? "s" : ""} to read before signing`
            : "No warnings for this configuration. That isn't a guarantee: read the notes and the preview."
        }
        action={<ShieldCheck className="size-5 text-fg-subtle" />}
      />
      <ul className="divide-y divide-border">
        {[...warnings, ...notes].map((f) => (
          <li key={f.title} className="flex gap-3 px-5 py-3.5 text-[13px] sm:px-6">
            {f.level === "warning" ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Warning" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-label="Note" />
            )}
            <div>
              <div className={f.level === "warning" ? "font-medium text-warning" : "font-medium"}>
                {f.level === "warning" && <span className="sr-only">Warning: </span>}
                {f.title}
              </div>
              <p className="mt-0.5 text-[13px] text-fg-muted">{f.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-5 py-3.5 text-xs leading-relaxed text-fg-subtle sm:px-6">
        These checks catch common configuration mistakes. They can&apos;t tell whether your verifier, recipient or executor is trustworthy, and Coftra
        is unaudited testnet software.
      </p>
    </Card>
  );
}
