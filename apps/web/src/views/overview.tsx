"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, CircleCheck, Clock3, Flag, Radio, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Card, CardHeader, Stat, Skeleton, buttonStyles } from "@/components/ui/primitives";
import { TaskRow } from "@/components/task-bits";
import { EmptyState, ErrorState, NotDeployed } from "@/components/states";
import { FundingSummary } from "@/components/funding";
import { RecentActivity } from "@/components/activity-feed";
import { deploymentInfo, useMyTasks } from "@/hooks/use-coftra";
import { fmtToken, relTime } from "@/lib/format";
import { TaskState } from "@/lib/protocol";

const engines = [
  {
    icon: Flag,
    name: "CHECKPOINT",
    body: "A verifier you name attests a milestone on-chain. Reactive Network relays it, and the vault releases exactly that milestone's amount. Once.",
  },
  {
    icon: CircleCheck,
    name: "CLOSEOUT",
    body: "When the outcome you funded actually happens on-chain, the task finalises: temporary spending rights are revoked and leftovers go back.",
  },
  {
    icon: Clock3,
    name: "FALLBACK",
    body: "If the deadline passes first, a Reactive Cron check expires the task. Completed payouts stand; everything unspent is returned.",
  },
];

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
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">Try it yourself in about 10 minutes</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2">
          {trySteps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{i + 1}</span>
              <div>
                <div className="text-sm font-medium">{s.title}</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-fg-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
      <Card className="p-5 text-[13px] leading-relaxed text-fg-muted">
        <h2 className="text-[15px] font-semibold text-fg">What Coftra controls</h2>
        <ul className="mt-3 space-y-2">
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
    <div className="space-y-6">
      <Card className="px-6 py-8 sm:px-8">
        <p className="text-sm font-medium text-accent">Set it and forget it</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-semibold leading-snug tracking-tight text-fg sm:text-[28px]">
          On-chain tasks don&apos;t end when the transaction is sent.
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
          Someone still has to check the outcome, release payments, revoke temporary permissions and recover leftover
          funds. Coftra does those steps for you, triggered by verifiable blockchain events through Reactive Network, so
          you can close the tab and come back to a finished task with a proof trail.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/proof" className={buttonStyles({ size: "lg" })}>
            <BadgeCheck className="size-4" /> See 4 verified automations
          </Link>
          <Link href="/create" className={buttonStyles({ variant: "secondary", size: "lg" })}>
            Try it on testnet <ArrowRight className="size-4" />
          </Link>
        </div>
        <p className="mt-3 text-xs text-fg-subtle">The verified demo needs no wallet. Every transaction opens on its block explorer.</p>
      </Card>
      <HowToTry />
      <div className="grid gap-4 md:grid-cols-3">
        {engines.map(({ icon: Icon, name, body }) => (
          <Card key={name} className="p-5">
            <Icon className="size-5 text-accent" />
            <div className="mt-3 font-mono text-xs font-medium tracking-wide text-fg">{name}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{body}</p>
          </Card>
        ))}
      </div>
      <Card className="grid gap-5 p-5 sm:grid-cols-3">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-fg-subtle" />
          <p className="text-sm text-fg-muted">Self-custodial. Funds sit in an open-source vault with per-task accounting; no admin can move them.</p>
        </div>
        <div className="flex gap-3">
          <Radio className="mt-0.5 size-5 shrink-0 text-fg-subtle" />
          <p className="text-sm text-fg-muted">No server in the loop. Lifecycle transitions are triggered by Reactive Network, not by this website.</p>
        </div>
        <div className="flex gap-3">
          <Clock3 className="mt-0.5 size-5 shrink-0 text-fg-subtle" />
          <p className="text-sm text-fg-muted">Never stuck. If automation is down, anyone can trigger the same fallback by hand 30 minutes after a deadline.</p>
        </div>
      </Card>
    </div>
  );
}

function Dashboard() {
  const { data, isLoading, error, refetch } = useMyTasks();
  if (error) return <ErrorState error={error} retry={() => refetch()} />;
  const tasks = data?.tasks ?? [];
  const owned = tasks.filter((t) => data?.owned.has(t.id.toString()));
  const active = owned.filter((t) => t.task.state === TaskState.Active);
  const allocated = active.reduce((s, t) => s + t.available, 0n);
  const reserved = active.reduce((s, t) => s + t.reserved, 0n);
  const next = active.map((t) => t.task.deadline).sort((a, b) => Number(a - b))[0];

  return (
    <div className="space-y-6">
      <Card className="grid grid-cols-2 gap-5 p-5 md:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)
        ) : (
          <>
            <Stat label="Active tasks" value={active.length} sub={`${owned.length} created in total`} />
            <Stat label="Held for active tasks" value={fmtToken(allocated)} />
            <Stat label="Reserved for milestones / caps" value={fmtToken(reserved)} />
            <Stat label="Next deadline" value={next ? relTime(next) : "—"} />
          </>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Your tasks</h2>
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
      <PageHeader title="Overview" description="Funded tasks, what Reactive Network has done for them, and whether automation can keep running." />
      {!deploymentInfo ? (
        <div className="space-y-6">
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
