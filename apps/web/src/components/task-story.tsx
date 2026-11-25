"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { Download, Printer, Zap } from "lucide-react";
import type { TaskView } from "@/lib/reads";
import { useVaultLogs } from "@/hooks/use-coftra";
import { receiptCsv, taskStory, type StoryLog } from "@/lib/story";
import { destination, explorerTx } from "@/lib/chains";
import { kindLabel, stateCopy, type TaskKind, type TaskState } from "@/lib/protocol";
import { Hex } from "./hex";
import { Button, Card, CardHeader, Skeleton } from "./ui/primitives";

/** The task's history told as everyday sentences, with a CSV download and a printable receipt. */
export function TaskStory({ t, label }: { t: TaskView; label?: string }) {
  const logs = useVaultLogs();
  const { address } = useAccount();
  const steps = useMemo(
    () => taskStory(t, (logs.data ?? []) as unknown as StoryLog[], address),
    [t, logs.data, address],
  );

  function download() {
    const csv = receiptCsv(t, steps, (h) => explorerTx(destination.id, h));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `coftra-task-${t.id}-receipt.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function print() {
    document.body.dataset.print = "receipt";
    const done = () => {
      delete document.body.dataset.print;
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  }

  return (
    <Card data-receipt="">
      <CardHeader
        title="What happened, in plain words"
        description="Built from the vault's on-chain events. Steps marked with a bolt were done by Reactive Network, not a person."
        action={
          <div className="flex gap-2 print:hidden">
            <Button variant="secondary" size="sm" disabled={steps.length === 0} onClick={download}>
              <Download className="size-4" /> CSV
            </Button>
            <Button variant="secondary" size="sm" disabled={steps.length === 0} onClick={print}>
              <Printer className="size-4" /> Print receipt
            </Button>
          </div>
        }
      />
      <div className="hidden px-5 pt-4 text-sm print:block">
        <div className="font-semibold">Coftra receipt · Task #{t.id.toString()}{label ? ` · ${label}` : ""}</div>
        <div>
          {kindLabel[t.task.kind as TaskKind]} · {stateCopy[t.task.state as TaskState].label} · Base Sepolia vault
        </div>
      </div>
      {logs.isLoading ? (
        <div className="p-5"><Skeleton className="h-24" /></div>
      ) : steps.length === 0 ? (
        <p className="px-5 py-6 text-sm text-fg-muted">No events found yet.</p>
      ) : (
        <ol className="space-y-3 p-5">
          {steps.map((s, i) => (
            <li key={`${s.tx}-${s.logIndex}`} className="flex gap-3 text-sm leading-relaxed">
              <span className="tabular mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs text-fg-muted">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p>
                  {s.text}
                  {s.automatic && <Zap className="ml-1 inline size-3.5 text-accent" aria-label="Done by Reactive Network" />}
                </p>
                <div className="mt-0.5 text-xs text-fg-subtle">
                  <Hex value={s.tx} kind="tx" chainId={destination.id} />
                  <span className="hidden print:inline"> {s.tx}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

