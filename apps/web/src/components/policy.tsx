"use client";

import React from "react";
import { Bot, ShieldCheck, UserCheck, UserRound, Users, Zap } from "lucide-react";
import type { TaskView } from "@/lib/reads";
import { destination } from "@/lib/chains";
import { fmtDate, fmtToken } from "@/lib/format";
import { TaskKind, TaskState } from "@/lib/protocol";
import { SESSION_SELECTOR } from "@/lib/tx-builders";
import { Hex } from "./hex";
import { Card, CardHeader } from "./ui/primitives";

/*
 * The task's spending policy, read from the vault, and who may move its money. Everything listed here is enforced
 * by CoftraVault on-chain; nothing in this card is a setting the app adds on top.
 */

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-2.5 text-[13px] sm:grid-cols-[220px_1fr] sm:px-6">
      <dt className="text-fg-muted">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

type Authority = { icon: typeof Zap; who: string; can: string; signs: string };

export function PolicyCard({ t }: { t: TaskView }) {
  const project = t.task.kind === TaskKind.ProjectBudget;
  const s = t.session as typeof t.session & { selector?: string; beneficiary?: string };
  const committed = t.milestones.reduce((a, m) => a + m.amount, 0n);
  const verifiers = Array.from(new Set(t.milestones.map((m) => m.verifier.toLowerCase())));
  const active = t.task.state === TaskState.Active;

  const authorities: Authority[] = project
    ? [
        {
          icon: Zap,
          who: "Reactive Network (automatic)",
          can: "Pays a checkpoint after its verifier's attestation (CHECKPOINT), closes the task and returns the reserve when the last one is paid (CLOSEOUT), and expires it after the deadline (FALLBACK). The vault re-checks every callback.",
          signs: "No signature from anyone involved",
        },
        {
          icon: UserCheck,
          who: verifiers.length > 1 ? "The named verifiers" : "The named verifier",
          can: "Confirms a checkpoint on the verifier registry. Can't change the amount, the recipient or the deadline.",
          signs: "The verifier signs the attestation",
        },
        {
          icon: UserRound,
          who: "The owner (manual)",
          can: "Can release a checkpoint's fixed amount to the set recipient before the deadline without the verifier (owner override), extend the deadline (verifiers then re-attest), and cancel only before activation.",
          signs: "The owner signs each action",
        },
        { icon: Users, who: "Anyone", can: "Can run the same fallback by hand 30 minutes after the deadline, if automation hasn't. Unspent funds go to the refund address.", signs: "Whoever runs it signs and pays gas" },
      ]
    : [
        {
          icon: Bot,
          who: "The executor",
          can: "Spends through the single permitted call, up to the cap and before the deadline. Approvals are exact and reset to zero after each call.",
          signs: "The executor signs each spend",
        },
        {
          icon: Zap,
          who: "Reactive Network (automatic)",
          can: "Closes the session when its outcome reaches the beneficiary (CLOSEOUT: executor revoked, the rest returned) and expires it after the deadline (FALLBACK).",
          signs: "No signature from anyone involved",
        },
        { icon: UserRound, who: "The owner (manual)", can: "Can cancel at any time (returns what's unspent and revokes the executor) and extend the deadline.", signs: "The owner signs each action" },
        { icon: Users, who: "Anyone", can: "Can run the fallback by hand 30 minutes after the deadline, if automation hasn't.", signs: "Whoever runs it signs and pays gas" },
      ];

  return (
    <Card>
      <CardHeader title="Spending policy" description="Read from the vault. Every line is enforced by the contract, not by this app." action={<ShieldCheck className="size-5 text-fg-subtle" aria-hidden />} />
      <dl className="divide-y divide-border">
        <Row k={project ? "Task budget" : "Deposit"}>
          <span className="tabular font-medium">{fmtToken(t.task.deposited)}</span>
        </Row>
        {project ? (
          <>
            {t.milestones.map((m, i) => (
              <Row key={i} k={`Checkpoint ${i + 1}`}>
                <span className="tabular">{fmtToken(m.amount)}</span>
                <span className="text-fg-muted"> · {m.done ? "paid" : "unpaid"} · verifier </span>
                <Hex value={m.verifier} chainId={destination.id} />
              </Row>
            ))}
            <Row k="Reserve">
              <span className="tabular">{fmtToken(t.task.deposited - committed)}</span>
              <span className="text-fg-muted"> · never payable to the recipient</span>
            </Row>
            <Row k="Authorised recipient">
              <Hex value={t.task.recipient} chainId={destination.id} />
            </Row>
          </>
        ) : (
          <>
            <Row k="Spending cap">
              <span className="tabular">{fmtToken(s.spendCap)}</span>
              <span className="text-fg-muted"> · spent {fmtToken(s.spent)} · left {fmtToken(active && s.executorActive ? s.spendCap - s.spent : 0n)}</span>
            </Row>
            <Row k="Allowed executor">
              <Hex value={s.executor} chainId={destination.id} />
              {!s.executorActive && <span className="text-fg-muted"> · access ended</span>}
            </Row>
            <Row k="Permitted action">
              {s.selector?.toLowerCase() === SESSION_SELECTOR.toLowerCase() ? "mint(beneficiary) on " : `selector ${s.selector ?? "?"} on `}
              <Hex value={s.target} chainId={destination.id} />
            </Row>
            {s.beneficiary && (
              <Row k="Beneficiary">
                <Hex value={s.beneficiary} chainId={destination.id} />
              </Row>
            )}
          </>
        )}
        <Row k="Deadline">{fmtDate(t.task.deadline)}</Row>
        <Row k="Refund destination">
          <Hex value={t.task.refundTo} chainId={destination.id} />
        </Row>
        <Row k="Cancellation">{project ? "Owner only, and only before activation" : "Owner, at any time while open"}</Row>
        <Row k="Owner · config version">
          <Hex value={t.task.owner} chainId={destination.id} /> <span className="text-fg-muted">· v{t.task.configVersion.toString()}</span>
        </Row>
      </dl>
      <div className="border-t border-border px-5 py-4 sm:px-6">
        <h3 className="text-xl">Who can move this task&apos;s money</h3>
        {project && (
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
            Checkpoint payments are normally released after the named verifier attests. The owner can also release a checkpoint directly; that
            skips the verifier, isn&apos;t a Reactive automation, and can still only pay that checkpoint&apos;s fixed amount to the recipient above.
          </p>
        )}
        <ul className="mt-3 space-y-3">
          {authorities.map(({ icon: Icon, who, can, signs }) => (
            <li key={who} className="flex gap-3 text-[13px]">
              <Icon className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
              <div className="min-w-0">
                <div className="font-medium">{who}</div>
                <div className="leading-relaxed text-fg-muted">{can}</div>
                <div className="text-xs text-fg-subtle">{signs}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
