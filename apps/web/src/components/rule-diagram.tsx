"use client";

import { ArrowRight } from "lucide-react";
import { ruleDiagram, type RuleBlock } from "@/lib/rule-diagram";
import type { RuleInput } from "@/lib/summary";
import { cn } from "@/lib/format";
import { Card } from "./ui/primitives";

const COLS = [
  { key: "when", title: "WHEN", tone: "border-info/30 bg-info-soft/40" },
  { key: "then", title: "THEN", tone: "border-success/30 bg-success-soft/40" },
  { key: "otherwise", title: "OTHERWISE", tone: "border-warning/30 bg-warning-soft/40" },
] as const;

/** Visual summary of the exact rule being signed. Edit links return to the form step that controls a block. */
export function RuleDiagramView({ rule, onEdit }: { rule: RuleInput; onEdit?: (step: 1 | 2) => void }) {
  const d = ruleDiagram(rule);
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Your rule at a glance</h2>
        <span className="text-xs text-fg-subtle">Built from the same values that are sent to the contract</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
        {COLS.map((c, i) => (
          <div key={c.key} className="contents">
            <section aria-label={c.title} className={cn("rounded-md border p-3", c.tone)}>
              <div className="font-mono text-xs font-semibold tracking-wide">{c.title}</div>
              <ul className="mt-2 space-y-2">
                {(d[c.key] as RuleBlock[]).map((b, j) => (
                  <li key={j} className="text-[13px]">
                    <div className="font-medium text-fg">{b.text}</div>
                    {b.detail && <div className="text-fg-muted">{b.detail}</div>}
                    {onEdit && (
                      <button type="button" onClick={() => onEdit(b.editStep)} className="mt-0.5 text-xs text-accent hover:underline">
                        Edit
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            {i < 2 && (
              <div className="hidden items-center justify-center md:flex" aria-hidden>
                <ArrowRight className="size-4 text-fg-subtle" />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
