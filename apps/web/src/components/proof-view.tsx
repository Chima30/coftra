"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { buildProof, type ProofStep } from "@/lib/proof";
import { deploymentInfo } from "@/hooks/use-coftra";
import { chainName, lasna } from "@/lib/chains";
import { callbackKindLabel, callbackResultCopy, CallbackKind } from "@/lib/protocol";
import { fmtNative, fmtToken, relTime, shortHex, uintToHash } from "@/lib/format";
import { Hex } from "./hex";
import { Badge, Card, Notice, Skeleton } from "./ui/primitives";
import { useBlockTime, type ActivityItem } from "./activity-feed";
import { useNow } from "@/hooks/use-now";

const stepIcon = {
  confirmed: <CheckCircle2 className="size-5 text-success" />,
  rejected: <XCircle className="size-5 text-warning" />,
  missing: <CircleDashed className="size-5 text-fg-subtle" />,
};

function Step({ s, last }: { s: ProofStep; last: boolean }) {
  return (
    <li className="relative pl-9">
      <span className="absolute left-0 top-0">{stepIcon[s.status]}</span>
      {!last && <span className="absolute left-[9px] top-6 h-[calc(100%-12px)] w-px bg-border" aria-hidden />}
      <div className="pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-medium text-fg">{s.title}</h4>
          <Badge>{chainName(s.chainId)}</Badge>
          {s.status === "missing" && <Badge tone="info">Not found yet</Badge>}
        </div>
        {s.txHash && (
          <div className="mt-1.5 text-sm text-fg-muted">
            Transaction <Hex value={s.txHash} kind="tx" chainId={s.chainId} />
          </div>
        )}
        {s.detail.length > 0 && (
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[140px_1fr]">
            {s.detail.map((d) => (
              <div key={d.label} className="contents">
                <dt className="text-fg-subtle">{d.label}</dt>
                <dd className="min-w-0 text-fg">
                  {d.mono && d.value.startsWith("0x") && d.value.length === 42 ? <Hex value={d.value} chainId={s.chainId} /> : <span className={d.mono ? "font-mono break-all" : ""}>{d.value}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </li>
  );
}

export function ProofView({ item }: { item: ActivityItem }) {
  const d = deploymentInfo;
  const proof = useQuery({
    queryKey: ["proof", item.key],
    enabled: !!d && item.status === "delivered",
    staleTime: 60_000,
    queryFn: () => buildProof(d!, item.status === "delivered" ? item.handled : (null as never)),
  });
  const now = useNow();
  const reqTime = useBlockTime("lasna", item.status === "awaiting" ? item.request.blockNumber : undefined);

  if (item.status === "awaiting") {
    const ageSec = reqTime.data && now > 0 ? now - Number(reqTime.data) : 0;
    const stale = ageSec > 15 * 60;
    return (
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium">{callbackKindLabel[item.kind]}</span>
          <Badge tone="info">Awaiting delivery</Badge>
          {reqTime.data && <span className="text-xs text-fg-subtle">requested {relTime(reqTime.data)}</span>}
        </div>
        <ol className="mt-5">
          <Step
            last={false}
            s={{ key: "origin", title: "Origin event", status: "confirmed", chainId: Number(item.request.args.originChainId), txHash: uintToHash(item.request.args.originTxHash!), detail: [] }}
          />
          <Step
            last={false}
            s={{ key: "reactive", title: "Reactive transaction — callback requested", status: "confirmed", chainId: lasna.id, txHash: item.request.transactionHash, detail: [] }}
          />
          <Step last s={{ key: "destination", title: "Destination callback", status: "missing", chainId: 84532, detail: [] }} />
        </ol>
        <Notice tone={stale ? "warning" : "info"} title={stale ? "Not delivered after 15 minutes" : "Waiting for the destination transaction"}>
          {stale ? (
            <>
              Reactive Network does not retry failed callbacks. Common causes: the vault has callback debt, or the gas limit was too low. Check
              Funding health. Recovery: expiries are re-requested automatically every few minutes until the vault confirms; milestones can be
              re-attested by the verifier or released by the owner; anyone can expire an overdue task by hand 30 minutes after its deadline.
            </>
          ) : (
            <>Deliveries usually land within a minute or two. This view updates automatically.</>
          )}
        </Notice>
      </Card>
    );
  }

  const result = Number((item.handled.args as { result: number }).result);
  const copy = callbackResultCopy[result as keyof typeof callbackResultCopy];
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium">{callbackKindLabel[item.kind]}</span>
          <span className="text-sm text-fg-muted">Task #{item.taskId.toString()}</span>
        </div>
        <Badge tone={copy.ok ? "success" : "warning"}>{copy.label}</Badge>
      </div>
      <p className="mt-2 text-sm text-fg-muted">{copy.explain}</p>

      {proof.isLoading ? (
        <Skeleton className="mt-5 h-48" />
      ) : proof.error || !proof.data ? (
        <Notice tone="warning" title="Couldn't rebuild every hop">
          Some RPC lookups failed{proof.error instanceof Error ? ` (${proof.error.message.split("\n")[0].slice(0, 160)})` : ""}. The destination
          transaction is still verifiable:{" "}
          <Hex value={item.handled.transactionHash} kind="tx" chainId={84532} />
        </Notice>
      ) : (
        <>
          <ol className="mt-5">
            {proof.data.steps.map((s, i) => (
              <div key={s.key}>
                <Step s={s} last={i === proof.data.steps.length - 1} />
                {i < proof.data.steps.length - 1 && <ArrowDown className="sr-only" aria-label="then" />}
              </div>
            ))}
          </ol>
          {proof.data.balanceChanges.length > 0 && (
            <div className="mt-1 rounded-md border border-border p-4">
              <h4 className="text-sm font-medium">Balance changes in the callback transaction</h4>
              <ul className="mt-2 space-y-1 text-[13px]">
                {proof.data.balanceChanges.map((b, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-2 text-fg-muted">
                    <span className="tabular font-medium text-fg">{fmtToken(b.amount)}</span>
                    <span>from {shortHex(b.from)} to</span>
                    <Hex value={b.to} chainId={84532} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {proof.data.costs.length > 0 && (
            <div className="mt-3 text-xs text-fg-subtle">
              Execution costs (from receipts):{" "}
              {proof.data.costs.map((c) => `${c.label} ${fmtNative(c.wei, c.symbol, 8)}`).join(" · ")}
            </div>
          )}
          {proof.data.steps.some((s) => s.status === "missing") && (
            <div className="mt-3 flex items-start gap-2 text-xs text-fg-subtle">
              <AlertTriangle className="mt-0.5 size-3.5" />
              A hop marked “not found yet” could not be fetched from its RPC. That is a lookup gap, not a failed execution: the vault event above is the
              authoritative record.
            </div>
          )}
          {item.kind === CallbackKind.Expiry && (
            <p className="mt-3 text-xs text-fg-subtle">Fallback checks start from a Reactive Cron tick on Lasna, so the origin and reactive transactions are both on Lasna.</p>
          )}
        </>
      )}
    </Card>
  );
}
