"use client";

import { ArrowRight } from "lucide-react";
import { ruleDiagram, type RuleBlock } from "@/lib/rule-diagram";
import type { RuleInput } from "@/lib/summary";
import { cn } from "@/lib/format";
import { Card } from "./ui/primitives";

const COLS = [
  { key: "when", title: "When", caption: "The condition", tone: "bg-info-soft", dot: "bg-periwinkle" },
  { key: "then", title: "Then", caption: "What the vault does", tone: "bg-success-soft", dot: "bg-mint" },
  { key: "otherwise", title: "Otherwise", caption: "If it doesn't happen in time", tone: "bg-warning-soft", dot: "bg-gold" },
] as const;

/** Visual summary of the exact rule being signed. Edit links return to the form step that controls a block. */
export function RuleDiagramView({ rule, onEdit }: { rule: RuleInput; onEdit?: (step: 1 | 2) => void }) {
  const d = ruleDiagram(rule);
  return (
    <Card className="rounded-[32px] p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[28px]">Your rule at a glance</h2>
        <span className="text-xs text-fg-subtle">Built from the same values that are sent to the contract</span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
        {COLS.map((c, i) => (
          <div key={c.key} className="contents">
            <section aria-label={c.title.toUpperCase()} className={cn("rounded-3xl p-4 sm:p-5", c.tone)}>
              <div className="flex items-center gap-2">
                <span className={cn("size-2.5 rounded-full", c.dot)} aria-hidden />
                <span className="text-[10px] uppercase tracking-[0.16em] text-fg-muted">{c.caption}</span>
              </div>
              <div className="mt-1 font-display text-[32px] leading-none text-fg">{c.title}</div>
              <ul className="mt-4 space-y-3">
                {(d[c.key] as RuleBlock[]).map((b, j) => (
                  <li key={j} className="text-[13px]">
                    <div className="font-medium text-fg">{b.text}</div>
                    {b.detail && <div className="text-fg-muted">{b.detail}</div>}
                    {onEdit && (
                      <button type="button" onClick={() => onEdit(b.editStep)} className="mt-1 rounded-full border border-accent/40 px-2.5 py-0.5 text-[11px] text-accent hover:bg-accent hover:text-accent-fg">
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
