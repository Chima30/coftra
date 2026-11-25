"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { Check, ChevronRight, X } from "lucide-react";
import { destination } from "@/lib/chains";
import { mockUsdcAbi } from "@/lib/contracts";
import { deploymentInfo, useMyTasks } from "@/hooks/use-coftra";
import { useActivity } from "./activity-feed";
import { TaskState } from "@/lib/protocol";
import { cn } from "@/lib/format";
import { Button, Card } from "./ui/primitives";

/* Dismissal is a per-browser preference; progress itself is always derived from wallet and chain state. */
const KEY = "coftra.guide.dismissed.v1";
const EVT = "coftra-guide";
const readDismissed = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const setDismissed = (v: boolean) => {
  try {
    if (v) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVT));
  } catch {
    /* storage unavailable */
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
};
export const useGuideDismissed = () => useSyncExternalStore(subscribe, readDismissed, () => true);

type Step = { title: string; done: boolean; body: string; href?: string; cta?: string };

function useSteps(): Step[] {
  const d = deploymentInfo;
  const { address, isConnected, chainId } = useAccount();
  const eth = useBalance({ address, chainId: destination.id, query: { enabled: !!address } });
  const tusdc = useReadContract({
    address: d?.token,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId: destination.id,
    query: { enabled: !!address && !!d },
  });
  const mine = useMyTasks();
  const { items } = useActivity();

  const owned = (mine.data?.tasks ?? []).filter((t) => mine.data?.owned.has(t.id.toString()));
  const ownedIds = new Set(owned.map((t) => t.id.toString()));
  const progressed = owned.find((t) => t.task.milestonesDone > 0 || t.task.state >= TaskState.Completed || t.session.executions > 0);
  const firstOwned = owned[0];
  const sawCallback = items.some((i) => i.status === "delivered" && ownedIds.has(i.taskId.toString()));

  return [
    {
      title: "Connect a wallet",
      done: isConnected,
      body: "Coftra never holds your keys. Your wallet signs each step; use a testnet-only account.",
    },
    {
      title: "Switch to Base Sepolia",
      done: isConnected && chainId === destination.id,
      body: "Base Sepolia (chain 84532) is the test network where the vault lives. The connect button offers to switch for you.",
    },
    {
      title: "Have a little test ETH for gas",
      done: (eth.data?.value ?? 0n) > 0n,
      body: "You pay normal gas for the transactions you sign. Get free Base Sepolia ETH from a public faucet.",
    },
    {
      title: "Get test tUSDC",
      done: ((tusdc.data as bigint | undefined) ?? 0n) > 0n,
      body: "tUSDC has no value. Press “Get 1,000 test tUSDC” in Create Automation.",
      href: "/create",
      cta: "Open Create",
    },
    {
      title: "Create your first task",
      done: owned.length > 0,
      body: "Pick a preset, read the Safety inspector, approve the exact amount (never unlimited) and create. Funds go into the vault under your rule.",
      href: "/create",
      cta: "Create a task",
    },
    {
      title: "Trigger an outcome",
      done: !!progressed,
      body: "As verifier, press “Attest completion” on the task page, or let the deadline pass. Reactive Network does the rest without you.",
      href: firstOwned ? `/tasks/${firstOwned.id}` : undefined,
      cta: "Open my task",
    },
    {
      title: "See the proof",
      done: sawCallback,
      body: "Automation Activity shows the origin event, the Reactive transaction and the vault callback for your task.",
      href: "/activity",
      cta: "Open Activity",
    },
  ];
}

export function FirstAutomationGuide({ compact = false }: { compact?: boolean }) {
  const dismissed = useGuideDismissed();
  const steps = useSteps();
  if (dismissed) return null;
  const done = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);
  if (current === -1) return null;
  const visible = compact ? [steps[current]] : steps;

  return (
    <Card className="p-5" role="region" aria-label="Your first automation">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl">Your first automation</h2>
          <p className="text-sm text-fg-muted">
            {done} of {steps.length} done · ticked from your wallet and the chain, nothing stored
          </p>
        </div>
        <Button variant="ghost" size="sm" aria-label="Hide this guide" onClick={() => setDismissed(true)}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full bg-fg" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 space-y-3">
        {visible.map((s) => {
          const i = steps.indexOf(s);
          const isCurrent = i === current;
          return (
            <li key={s.title} className="flex gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                  s.done ? "border-success bg-success-soft text-success" : isCurrent ? "border-fg text-fg" : "border-border-strong text-fg-subtle",
                )}
              >
                {s.done ? <Check className="size-3" /> : i + 1}
              </span>
              <div className="min-w-0">
                <div className={cn("text-sm", isCurrent ? "font-medium" : s.done ? "text-fg-muted line-through" : "text-fg-muted")}>{s.title}</div>
                {isCurrent && (
                  <>
                    <p className="mt-0.5 text-[13px] text-fg-muted">{s.body}</p>
                    {s.href && s.cta && (
                      <Link href={s.href} className="mt-1 inline-flex items-center gap-1 text-sm text-accent hover:underline">
                        {s.cta} <ChevronRight className="size-3.5" />
                      </Link>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {compact && (
        <Link href="/" className="mt-3 inline-block text-xs text-fg-subtle hover:text-fg">
          See all steps on Overview
        </Link>
      )}
    </Card>
  );
}

/** Small link to bring the guide back after dismissing it. */
export function ShowGuideLink() {
  const dismissed = useGuideDismissed();
  if (!dismissed) return null;
  return (
    <button type="button" onClick={() => setDismissed(false)} className="text-xs text-fg-subtle hover:text-fg">
      Show the first-automation guide
    </button>
  );
}
