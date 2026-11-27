"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Info, XCircle } from "lucide-react";
import { decodeEventLog, erc20Abi } from "viem";
import { PageHeader } from "@/components/app-shell";
import { Hex } from "@/components/hex";
import { ErrorState, NotDeployed } from "@/components/states";
import { Button, Card, CardHeader, Input, Skeleton, buttonStyles } from "@/components/ui/primitives";
import { deploymentInfo, useVaultLogs } from "@/hooks/use-coftra";
import { destination } from "@/lib/chains";
import { CALLBACK_PROXY } from "@/lib/contracts";
import { readTask } from "@/lib/reads";
import { destinationClient } from "@/lib/wagmi";
import { verifyTask, type Check, type Transfer, type VerifyLog } from "@/lib/verify-task";

const RELEVANT = new Set(["TaskCreated", "MilestoneReleased", "SessionExecuted", "Settled", "ReactiveCallbackHandled"]);

/** Fetch a task, its vault events and the receipts behind them, then run the checks. Read-only, no wallet. */
function useVerification(id: bigint | null) {
  const logs = useVaultLogs();
  return useQuery({
    queryKey: ["verifyTask", id?.toString(), logs.dataUpdatedAt],
    enabled: !!deploymentInfo && id !== null && !!logs.data,
    queryFn: async () => {
      const d = deploymentInfo!;
      const t = await readTask(d, id!);
      const mine = (logs.data ?? [])
        .filter((l) => RELEVANT.has(l.eventName) && (l.args as { taskId?: bigint }).taskId === id)
        .map((l) => ({ eventName: l.eventName, args: l.args as Record<string, unknown>, transactionHash: l.transactionHash as string })) satisfies VerifyLog[];
      const hashes = [...new Set(mine.filter((l) => l.eventName !== "TaskCreated" && l.eventName !== "SessionExecuted").map((l) => l.transactionHash))];
      const txs: Record<string, { to: string | null; transfers: Transfer[] }> = {};
      await Promise.all(
        hashes.map(async (h) => {
          const [tx, rc] = await Promise.all([destinationClient.getTransaction({ hash: h as `0x${string}` }), destinationClient.getTransactionReceipt({ hash: h as `0x${string}` })]);
          const transfers: Transfer[] = [];
          for (const lg of rc.logs) {
            if (lg.address.toLowerCase() !== d.token.toLowerCase()) continue;
            try {
              const ev = decodeEventLog({ abi: erc20Abi, data: lg.data, topics: lg.topics });
              if (ev.eventName === "Transfer") transfers.push({ from: ev.args.from, to: ev.args.to, amount: ev.args.value });
            } catch {
              /* not a Transfer */
            }
          }
          txs[h] = { to: tx.to ?? null, transfers };
        }),
      );
      return { checks: verifyTask({ t, logs: mine, txs, vault: d.vault, callbackProxy: CALLBACK_PROXY }), readAt: Date.now() };
    },
  });
}

const ICON = {
  pass: <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Passed" />,
  fail: <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-label="Failed" />,
  info: <Info className="mt-0.5 size-5 shrink-0 text-fg-subtle" aria-label="Information" />,
};

function Results({ id }: { id: bigint }) {
  const q = useVerification(id);
  const logs = useVaultLogs();
  if (logs.error || q.error) return <ErrorState error={logs.error ?? q.error} retry={() => (logs.error ? logs.refetch() : q.refetch())} />;
  if (!q.data)
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-[13px] text-fg-muted">
          <CircleDashed className="size-5 animate-pulse" aria-hidden /> Reading task #{id.toString()}, its vault events and their receipts from Base Sepolia…
        </div>
        <Skeleton className="mt-4 h-40" />
      </Card>
    );
  const checks: Check[] = q.data.checks;
  const failed = checks.filter((c) => c.status === "fail").length;
  const passed = checks.filter((c) => c.status === "pass").length;
  return (
    <Card>
      <CardHeader
        title={failed ? `${failed} check${failed > 1 ? "s" : ""} failed` : `${passed} checks passed, none failed`}
        description={`Task #${id} · read from Base Sepolia at ${new Date(q.data.readAt).toLocaleTimeString()}. Nothing here is stored or summarised by Coftra; it's recomputed each time.`}
        action={
          <Link href={`/tasks/${id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            Open task #{id.toString()}
          </Link>
        }
      />
      <ul className="divide-y divide-border">
        {checks.map((c, i) => (
          <li key={i} className="flex gap-3 px-5 py-3.5 text-[13px] sm:px-6">
            {ICON[c.status]}
            <div className="min-w-0 flex-1">
              <div className="font-medium">{c.title}</div>
              <div className="leading-relaxed text-fg-muted">{c.detail}</div>
              {c.tx && <Hex value={c.tx} kind="tx" chainId={destination.id} />}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function VerifyView() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("task") ?? "";
  const id = /^\d+$/.test(raw) && raw !== "0" ? BigInt(raw) : null;
  const [value, setValue] = useState(raw);
  const go = (v: string) => router.replace(`/verify?task=${encodeURIComponent(v.trim())}`);
  return (
    <>
      <PageHeader
        title="Verify a task"
        description="Check any Coftra task yourself, without a wallet: that its deposit, every payment and every refund match the vault's rules and the transaction receipts, and that automatic steps really came from Reactive Network."
      />
      {!deploymentInfo ? (
        <NotDeployed />
      ) : (
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                go(value);
              }}
            >
              <label htmlFor="verify-task" className="w-full text-[13px] font-medium sm:w-auto">
                Task number
              </label>
              <Input id="verify-task" inputMode="numeric" placeholder="e.g. 1" value={value} onChange={(e) => setValue(e.target.value)} className="max-w-48" />
              <Button type="submit" disabled={!/^\d+$/.test(value.trim()) || value.trim() === "0"}>
                Verify
              </Button>
            </form>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
              The recorded demo runs:
              {["1", "2", "3"].map((n) => (
                <button key={n} type="button" onClick={() => (setValue(n), go(n))} className="rounded-full border border-border px-3 py-1 hover:border-fg/40 hover:text-fg">
                  Task #{n}
                </button>
              ))}
            </div>
          </Card>
          {raw && id === null && <p className="text-[13px] text-danger">Enter a task number, like 1.</p>}
          {id !== null && <Results id={id} />}
          <p className="text-xs text-fg-subtle">
            Checks: the creation event matches the vault; every token is accounted for; each checkpoint paid the rule&apos;s amount to the rule&apos;s recipient,
            once, with the transfer in its receipt; automatic payments and closes came through Reactive&apos;s callback proxy with an applied callback;
            leftovers went to the refund address; a session never spent past its cap.
          </p>
        </div>
      )}
    </>
  );
}
