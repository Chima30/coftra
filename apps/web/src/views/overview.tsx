"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useEffect, useState } from "react";
import { Clock3, Radio, ShieldCheck } from "lucide-react";
import { Engines, Hero, Workflow } from "@/components/landing";
import { CoftraAutomationPipeline } from "@/components/automation-pipeline";
import { PageHeader } from "@/components/app-shell";
import { Card, CardHeader, Skeleton, buttonStyles } from "@/components/ui/primitives";
import { TaskRow } from "@/components/task-bits";
import { EmptyState, ErrorState, NotDeployed, StaleNotice } from "@/components/states";
import { FundingSummary } from "@/components/funding";
import { NeedsYou } from "@/components/needs-you";
import { TaskHealthSummary } from "@/components/health";
import { RecentActivity } from "@/components/activity-feed";
import { FirstAutomationGuide, ShowGuideLink } from "@/components/first-guide";
import { deploymentInfo, useMyTasks } from "@/hooks/use-coftra";

const trySteps = [
  {
    title: "Get a testnet wallet",
    body: "Any browser wallet on Base Sepolia (chain 84532), with a little test ETH from a Base Sepolia faucet for gas. Never use a wallet holding real funds.",
  },
  {
    title: "Get test tokens",
    body: "Connect, open Create Automation and press “Get 1,000 test tUSDC”. tUSDC is a test token with no value.",
  },
  {
    title: "Create a task",
    body: "Pick a template. For the quickest result, name yourself as verifier and pick the 15-minute deadline. Read the Safety preview, then approve the exact amount and create.",
  },
  {
    title: "Watch it finish without you",
    body: "Attest a checkpoint from the task page, or do nothing and let the deadline pass. Reactive Network triggers the payout or the refund, and it appears in Automation Activity.",
  },
];

function HowToTry() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="p-6 sm:p-8">
        <h2 className="text-3xl">Try it yourself in about ten minutes</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2">
          {trySteps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-fg/70 text-xs text-fg">{i + 1}</span>
              <div>
                <div className="text-[13px] font-medium">{s.title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
      <Card className="bg-surface-2 p-6 text-[13px] leading-relaxed text-fg-muted sm:p-8">
        <h2 className="text-3xl text-fg">What Coftra controls</h2>
        <ul className="mt-5 space-y-3">
          <li>
            <span className="font-medium text-fg">Only what you deposit.</span> The vault holds each task&apos;s funds separately. It never gets access to
            your wallet.
          </li>
          <li>
            <span className="font-medium text-fg">Only the rule you approved.</span> Payouts go to the recipient you set; leftovers go to your refund
            address.
          </li>
          <li>
            <span className="font-medium text-fg">Never stuck.</span> If automation is down, the deadline fallback can be run by anyone 30 minutes later.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function Intro() {
  return (
    <div className="space-y-14 lg:space-y-20">
      <div className="space-y-4">
        <Hero />
        <CoftraAutomationPipeline />
      </div>
      <Engines />
      <Workflow />
      <HowToTry />
      <div className="grid gap-6 border-t border-border pt-8 sm:grid-cols-3">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-fg-subtle" aria-hidden />
          <p className="text-[13px] leading-relaxed text-fg-muted">Self-custodial. Funds sit in an open-source vault with per-task accounting; no admin can move them.</p>
        </div>
        <div className="flex gap-3">
          <Radio className="mt-0.5 size-5 shrink-0 text-fg-subtle" aria-hidden />
          <p className="text-[13px] leading-relaxed text-fg-muted">No server in the loop. Lifecycle transitions are triggered by Reactive Network, not by this website.</p>
        </div>
        <div className="flex gap-3">
          <Clock3 className="mt-0.5 size-5 shrink-0 text-fg-subtle" aria-hidden />
          <p className="text-[13px] leading-relaxed text-fg-muted">Never stuck. If automation is down, anyone can trigger the same fallback by hand 30 minutes after a deadline.</p>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useMyTasks();
  if (error && !data) return <ErrorState error={error} retry={() => refetch()} />;
  const tasks = data?.tasks ?? [];
  const owned = tasks.filter((t) => data?.owned.has(t.id.toString()));

  return (
    <div className="space-y-6">
      <StaleNotice error={error} at={dataUpdatedAt} />
      <FirstAutomationGuide />
      {isLoading ? <Skeleton className="h-48" /> : <TaskHealthSummary tasks={owned} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <NeedsYou />
          <div className="flex items-center justify-between pt-3">
            <h2 className="text-xl">Your tasks</h2>
            <Link href="/vaults" className="text-sm text-accent hover:underline">View all</Link>
          </div>
          {isLoading ? (
            <Skeleton className="h-24" />
          ) : tasks.length === 0 ? (
            <EmptyState
              title="No tasks yet"
              body="Create a project budget or a spending session. You'll see it here, read straight from the vault."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/create" className={buttonStyles()}>Create automation</Link>
                  <Link href="/proof" className={buttonStyles({ variant: "secondary" })}>See verified examples</Link>
                </div>
              }
            />
          ) : (
            tasks.slice(0, 5).map((t) => <TaskRow key={t.id.toString()} t={t} role={data?.owned.has(t.id.toString()) ? undefined : "Involved"} />)
          )}
        </div>
        <div className="space-y-6">
          <FundingSummary />
          <Card>
            <CardHeader title="Recent automation" description="Callbacks handled by the vault" />
            <RecentActivity limit={5} />
          </Card>
        </div>
      </div>
    </div>
  );
}

export function OverviewView() {
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- wallet state is client-only
  useEffect(() => setMounted(true), []);
  return (
    <>
      {mounted && isConnected && deploymentInfo && (
        <PageHeader
          title="Overview"
          description="Funded tasks, what Reactive Network has done for them, and whether automation can keep running."
          action={<ShowGuideLink />}
        />
      )}
      {!deploymentInfo ? (
        <div className="space-y-10">
          <Intro />
          <NotDeployed />
        </div>
      ) : mounted && isConnected ? (
        <Dashboard />
      ) : (
        <Intro />
      )}
    </>
  );
}
