"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { nameOf, useContacts } from "@/lib/contacts";
import { shortHex } from "@/lib/format";
import { outcomes } from "@/lib/outcomes";
import type { RuleInput } from "@/lib/summary";
import { Card, CardHeader } from "./ui/primitives";

/** "What will happen": each case the rule allows, with where the money ends up. Same values as the contract call. */
export function OutcomePreview({ rule }: { rule: RuleInput }) {
  const { address } = useAccount();
  const contacts = useContacts();
  const cases = useMemo(() => outcomes(rule, address, (a) => nameOf(contacts, a) ?? shortHex(a)), [rule, address, contacts]);
  return (
    <Card>
      <CardHeader title="What will happen" description="Every case this rule allows, and where the money ends up in each. Nothing else is possible." />
      <ol className="divide-y divide-border">
        {cases.map((c, i) => (
          <li key={c.when} className="grid gap-3 px-5 py-5 sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-6 sm:px-6">
            <div>
              <div className="text-xs text-fg-subtle">Case {i + 1}</div>
              <h3 className="mt-1 text-[22px] leading-snug text-fg">{c.when}</h3>
            </div>
            <div className="min-w-0 space-y-2 text-[13px] leading-relaxed">
              <ul className="space-y-1.5">
                {c.result.map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-fg-subtle" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-fg-subtle">{c.closedBy}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
