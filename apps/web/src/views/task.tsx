"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { ArrowLeft } from "lucide-react";
import { encodeFunctionData } from "viem";
import { PageHeader } from "@/components/app-shell";
import { FundsBar, StateBadge } from "@/components/task-bits";
import { Hex } from "@/components/hex";
import { EmptyState, ErrorState, NotDeployed } from "@/components/states";
import { RecentActivity, useBlockTime } from "@/components/activity-feed";
import { TxStatusLine } from "@/components/tx-status";
import { Badge, Button, Card, CardHeader, Input, Notice, Skeleton, Stat } from "@/components/ui/primitives";
import { deploymentInfo, useTask, useVaultLogs } from "@/hooks/use-coftra";
import { useTx } from "@/hooks/use-tx";
import { useNow } from "@/hooks/use-now";
import { demoNftAbi, registryAbi, vaultAbi } from "@/lib/contracts";
import { destination } from "@/lib/chains";
import { fmtDate, fmtToken, relTime, shortHex, uintToHash } from "@/lib/format";
import { isTerminal, kindLabel, stateCopy, TaskKind, TaskState, callbackKindLabel, callbackResultCopy, CallbackResult } from "@/lib/protocol";
import { ruleSentences } from "@/lib/summary";
import type { TaskView as T, VaultLog } from "@/lib/reads";

const MANUAL_RECOVERY_DELAY = 30n * 60n;

export function TaskView({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = use(params);
  const id = /^\d+$/.test(raw) ? BigInt(raw) : null;
  const q = useTask(id);

  if (!deploymentInfo) return <NotDeployed />;
  if (id === null) return <EmptyState title="Invalid task id" />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <Skeleton className="h-96" />;
  if (q.data.task.state === TaskState.None) return <EmptyState title={`Task #${raw} does not exist`} body="No task with this id has been created in the vault." />;

  return <Detail t={q.data} />;
}

function Detail({ t }: { t: T }) {
  const { address } = useAccount();
  const state = t.task.state as TaskState;
  const kind = t.task.kind as TaskKind;
  const me = address?.toLowerCase();
  const isOwner = me === t.task.owner.toLowerCase();
  const isExecutor = kind === TaskKind.SpendingSession && me === t.session.executor.toLowerCase();
  const verifierOf = t.milestones.map((m, i) => (me === m.verifier.toLowerCase() ? i : -1)).filter((i) => i >= 0);

  const sentences = useMemo(
    () =>
      kind === TaskKind.ProjectBudget
        ? ruleSentences({
            kind,
            amount: t.task.deposited,
            recipient: t.task.recipient,
            refundTo: t.task.refundTo,
            deadline: Number(t.task.deadline),
            milestones: t.milestones.map((m) => ({ amount: m.amount, verifier: m.verifier })),
          })
        : ruleSentences({
            kind,
            amount: t.task.deposited,
            refundTo: t.task.refundTo,
            deadline: Number(t.task.deadline),
            executor: t.session.executor,
            target: t.session.target,
            beneficiary: t.session.beneficiary,
            spendCap: t.session.spendCap,
            operation: "mint(beneficiary)",
          }),
    [t, kind],
  );

  const roles = [isOwner && "Owner", isExecutor && "Executor", verifierOf.length > 0 && "Verifier"].filter(Boolean) as string[];

  return (
    <>
      <Link href="/vaults" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" /> My Vaults
      </Link>
      <PageHeader
        title={`Task #${t.id}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StateBadge state={state} />
            <span>{kindLabel[kind]}</span>
            {roles.map((r) => (
              <Badge key={r}>You: {r}</Badge>
            ))}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <div className="grid grid-cols-2 gap-5 p-5 md:grid-cols-4">
              <Stat label="Deposited" value={fmtToken(t.task.deposited)} />
              <Stat label={kind === TaskKind.ProjectBudget ? "Released" : "Spent"} value={fmtToken(t.task.released)} />
              <Stat label="Still in vault" value={fmtToken(t.available)} sub={t.reserved > 0n ? `${fmtToken(t.reserved)} reserved` : undefined} />
              <Stat label="Returned" value={fmtToken(t.task.refunded)} />
            </div>
            <div className="border-t border-border px-5 py-4">
              <FundsBar t={t} />
              <p className="mt-3 text-sm text-fg-muted">{stateCopy[state].hint}</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Rule" description="As stored in the vault right now." />
            <ul className="space-y-2 p-5 text-sm leading-relaxed">
              {sentences.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
            <dl className="grid gap-x-6 gap-y-2 border-t border-border px-5 py-4 text-sm sm:grid-cols-[160px_1fr]">
              <dt className="text-fg-muted">Owner</dt>
              <dd><Hex value={t.task.owner} chainId={destination.id} /></dd>
              {kind === TaskKind.ProjectBudget && (
                <>
                  <dt className="text-fg-muted">Recipient</dt>
                  <dd><Hex value={t.task.recipient} chainId={destination.id} /></dd>
                </>
              )}
              <dt className="text-fg-muted">Refund address</dt>
              <dd><Hex value={t.task.refundTo} chainId={destination.id} /></dd>
              <dt className="text-fg-muted">Deadline</dt>
              <dd>{fmtDate(t.task.deadline)} <span className="text-fg-subtle">({relTime(t.task.deadline)})</span></dd>
              <dt className="text-fg-muted">Config version</dt>
              <dd>v{t.task.configVersion.toString()}</dd>
            </dl>
          </Card>

          {kind === TaskKind.ProjectBudget ? <Milestones t={t} verifierOf={verifierOf} isOwner={isOwner} /> : <SessionPanel t={t} isExecutor={isExecutor} />}

          <Timeline id={t.id} />
        </div>

        <div className="space-y-6">
          <Actions t={t} isOwner={isOwner} />
          <Card>
            <CardHeader title="Reactive proofs" description="Callbacks for this task" />
            <RecentActivity taskId={t.id} limit={20} />
          </Card>
        </div>
      </div>
    </>
  );
}

function Milestones({ t, verifierOf, isOwner }: { t: T; verifierOf: number[]; isOwner: boolean }) {
  const d = deploymentInfo!;
  const attest = useTx();
  const release = useTx();
  const { address } = useAccount();
  const can = useReadContracts({
    contracts: verifierOf.map((i) => ({
      address: d.vault,
      abi: vaultAbi,
      functionName: "canAttest" as const,
      args: [t.id, BigInt(i), address!, t.task.configVersion] as const,
    })),
    query: { enabled: verifierOf.length > 0 && !!address, refetchInterval: 10_000 },
  });
  const active = t.task.state === TaskState.Active;
  const nowTs = useNow();
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const logs = useVaultLogs();
  // How each paid checkpoint was released, straight from MilestoneReleased(viaReactive).
  const paidVia = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const l of logs.data ?? []) {
      if (l.eventName !== "MilestoneReleased") continue;
      const a = l.args as { taskId: bigint; milestoneIndex: bigint; viaReactive: boolean };
      if (a.taskId === t.id) m.set(Number(a.milestoneIndex), a.viaReactive);
    }
    return m;
  }, [logs.data, t.id]);
  return (
    <Card>
      <CardHeader
        title="Checkpoints"
        description="CHECKPOINT engine: paid automatically by a Reactive callback after the named verifier attests. The owner can also override (see below)."
      />
      <ul className="divide-y divide-border">
        {t.milestones.map((m, i) => {
          const vi = verifierOf.indexOf(i);
          const canAttest = vi >= 0 && (can.data?.[vi]?.result as boolean | undefined);
          return (
            <li key={i} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Checkpoint {i + 1}</span>
                  {m.done ? (
                    paidVia.get(i) === false ? (
                      <Badge tone="warning">Paid by owner override</Badge>
                    ) : paidVia.get(i) === true ? (
                      <Badge tone="success">Verified · paid via Reactive</Badge>
                    ) : (
                      <Badge tone="success">Released</Badge>
                    )
                  ) : active ? (
                    <Badge tone="info">Waiting for verifier</Badge>
                  ) : (
                    <Badge>Not released</Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
                  <span className="tabular">{fmtToken(m.amount)}</span> · verifier <Hex value={m.verifier} chainId={destination.id} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {canAttest && (
                  <Button
                    size="sm"
                    disabled={attest.busy}
                    onClick={() =>
                      attest.run(`Attest checkpoint ${i + 1}`, {
                        address: d.verifierRegistry,
                        abi: registryAbi,
                        functionName: "attest",
                        args: [t.id, BigInt(i), t.task.configVersion],
                      })
                    }
                  >
                    Attest completion
                  </Button>
                )}
                {isOwner && active && !m.done && Number(t.task.deadline) > nowTs && confirmIdx !== i && (
                  <Button size="sm" variant="secondary" disabled={release.busy} onClick={() => setConfirmIdx(i)}>
                    Owner override…
                  </Button>
                )}
              </div>
              {confirmIdx === i && (
                <div className="w-full rounded-md border border-warning/40 bg-warning-soft p-3 text-[13px] sm:basis-full" role="alertdialog" aria-label="Confirm owner override">
                  <div className="font-medium text-warning">Pay checkpoint {i + 1} without the verifier?</div>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-fg-muted">
                    <li>
                      Sends {fmtToken(m.amount)} to the recipient now, from your task deposit. No attestation from {shortHex(m.verifier)} is needed or
                      recorded.
                    </li>
                    <li>This is a normal transaction you sign, not a Reactive automation, so it won&apos;t appear in the Proof Center.</li>
                    <li>It can&apos;t be undone, and the checkpoint can never be paid again. It can only go to the recipient set at creation.</li>
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={release.busy}
                      onClick={async () => {
                        await release.run(`Owner override: pay checkpoint ${i + 1}`, {
                          address: d.vault,
                          abi: vaultAbi,
                          functionName: "ownerReleaseMilestone",
                          args: [t.id, BigInt(i)],
                        });
                        setConfirmIdx(null);
                      }}
                    >
                      Pay without verifier
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmIdx(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="space-y-2 border-t border-border px-5 py-3">
        <TxStatusLine status={attest.status} hash={attest.hash} error={attest.error} slow={attest.slow} />
        {attest.status === "confirmed" && (
          <p className="text-sm text-fg-muted">
            Attestation recorded. Reactive Network now relays it to the vault. In our recorded runs the callback landed within about 3 seconds;
            this page refreshes every 10 seconds. If nothing arrives, check Funding Health in Settings.
          </p>
        )}
        <TxStatusLine status={release.status} hash={release.hash} error={release.error} slow={release.slow} />
        {release.status === "confirmed" && (
          <p className="text-sm text-fg-muted">Paid by owner override. This was your own transaction, not a Reactive callback.</p>
        )}
      </div>
    </Card>
  );
}

function SessionPanel({ t, isExecutor }: { t: T; isExecutor: boolean }) {
  const d = deploymentInfo!;
  const exec = useTx();
  const price = useReadContract({ address: d.demoNft, abi: demoNftAbi, functionName: "price" });
  const active = t.task.state === TaskState.Active && t.session.executorActive;
  return (
    <Card>
      <CardHeader title="Spending session" description="CLOSEOUT engine: ends automatically once the paid-for mint is observed on-chain." />
      <dl className="grid gap-x-6 gap-y-2 p-5 text-sm sm:grid-cols-[160px_1fr]">
        <dt className="text-fg-muted">Executor</dt>
        <dd className="flex items-center gap-2">
          <Hex value={t.session.executor} chainId={destination.id} />
          {t.session.executorActive ? <Badge tone="accent">Can spend</Badge> : <Badge>Revoked</Badge>}
        </dd>
        <dt className="text-fg-muted">Permitted call</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px]">mint(beneficiary)</span> on <Hex value={t.session.target} chainId={destination.id} />
        </dd>
        <dt className="text-fg-muted">Beneficiary</dt>
        <dd><Hex value={t.session.beneficiary} chainId={destination.id} /></dd>
        <dt className="text-fg-muted">Spent / cap</dt>
        <dd className="tabular">{fmtToken(t.session.spent)} of {fmtToken(t.session.spendCap)}</dd>
        <dt className="text-fg-muted">Executions</dt>
        <dd>{t.session.executions}</dd>
      </dl>
      {isExecutor && (
        <div className="space-y-2 border-t border-border px-5 py-4">
          {active ? (
            <Button
              disabled={exec.busy || price.data === undefined}
              onClick={() =>
                exec.run("Execute session: mint", {
                  address: d.vault,
                  abi: vaultAbi,
                  functionName: "executeSession",
                  args: [t.id, price.data as bigint, encodeMint(t.session.beneficiary)],
                })
              }
            >
              Execute permitted mint ({fmtToken(price.data as bigint | undefined)})
            </Button>
          ) : (
            <p className="text-sm text-fg-muted">Your spending authority for this session has ended.</p>
          )}
          <TxStatusLine status={exec.status} hash={exec.hash} error={exec.error} slow={exec.slow} />
          {exec.status === "confirmed" && (
            <p className="text-sm text-fg-muted">Mint done. Reactive Network will observe it and close the session; refresh in a minute to see the closeout.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function encodeMint(to: `0x${string}`) {
  return encodeFunctionData({ abi: demoNftAbi, functionName: "mint", args: [to] });
}

function Actions({ t, isOwner }: { t: T; isOwner: boolean }) {
  const d = deploymentInfo!;
  const { address } = useAccount();
  const tx = useTx();
  const [newDeadline, setNewDeadline] = useState("");
  const state = t.task.state as TaskState;
  const now = BigInt(useNow());
  const recoveryAt = t.task.deadline + MANUAL_RECOVERY_DELAY;
  const credit = useReadContract({
    address: d.vault,
    abi: vaultAbi,
    functionName: "credits",
    args: [t.task.token, address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });
  const canCancel = isOwner && (state === TaskState.Funded || (state === TaskState.Active && t.task.kind === TaskKind.SpendingSession));

  return (
    <Card>
      <CardHeader title="Actions" description="Only what your role allows right now." />
      <div className="space-y-4 p-5 text-sm">
        {isOwner && state === TaskState.Funded && (
          <Button className="w-full" disabled={tx.busy} onClick={() => tx.run("Activate", { address: d.vault, abi: vaultAbi, functionName: "activate", args: [t.id] })}>
            Activate automation
          </Button>
        )}
        {isOwner && state === TaskState.Active && now < t.task.deadline && (
          <div className="space-y-2">
            <label htmlFor="nd" className="font-medium">Extend deadline</label>
            <Input id="nd" type="datetime-local" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />
            <p className="text-xs text-fg-subtle">Bumps the config version: verifiers must re-attest against the new version.</p>
            <Button
              variant="secondary"
              className="w-full"
              disabled={!newDeadline || tx.busy}
              onClick={() =>
                tx.run("Extend deadline", {
                  address: d.vault,
                  abi: vaultAbi,
                  functionName: "extendDeadline",
                  args: [t.id, BigInt(Math.floor(new Date(newDeadline).getTime() / 1000))],
                })
              }
            >
              Extend
            </Button>
          </div>
        )}
        {canCancel && (
          <Button variant="danger" className="w-full" disabled={tx.busy} onClick={() => tx.run("Cancel task", { address: d.vault, abi: vaultAbi, functionName: "cancel", args: [t.id] })}>
            Cancel and return funds
          </Button>
        )}
        {state === TaskState.Active && now >= t.task.deadline && (
          <div className="space-y-2">
            <Notice tone="info" title="Deadline passed">
              Reactive Cron should expire this task shortly.{" "}
              {now >= recoveryAt
                ? "Automation hasn't done it yet, so anyone can now run the fallback by hand."
                : `If it hasn't by ${fmtDate(recoveryAt)}, anyone can run the same fallback by hand.`}
            </Notice>
            {now >= recoveryAt && (
              <Button variant="secondary" className="w-full" disabled={tx.busy} onClick={() => tx.run("Manual expiry", { address: d.vault, abi: vaultAbi, functionName: "expire", args: [t.id] })}>
                Run fallback manually
              </Button>
            )}
          </div>
        )}
        {(credit.data ?? 0n) > 0n && (
          <div className="space-y-2">
            <Notice tone="warning" title={`${fmtToken(credit.data)} waiting for you`}>
              A transfer to your address failed earlier (for example, the token blocked it), so the vault kept it claimable.
            </Notice>
            <Button className="w-full" disabled={tx.busy} onClick={() => tx.run("Claim", { address: d.vault, abi: vaultAbi, functionName: "claim", args: [t.task.token] })}>
              Claim
            </Button>
          </div>
        )}
        {isTerminal(state) && <p className="text-fg-muted">This task is final. Nothing can reopen it or move its funds again.</p>}
        {!isOwner && !isTerminal(state) && state !== TaskState.Active && <p className="text-fg-muted">Only the owner can act on this task.</p>}
        <TxStatusLine status={tx.status} hash={tx.hash} error={tx.error} slow={tx.slow} />
      </div>
    </Card>
  );
}

const eventCopy: Record<string, string> = {
  TaskCreated: "Task created and funded",
  TaskActivated: "Automation activated",
  DeadlineExtended: "Deadline extended",
  MilestoneReleased: "Checkpoint released",
  SessionExecuted: "Executor spent from session",
  ExecutorRevoked: "Executor access revoked",
  Settled: "Settled",
  TaskClosed: "Task closed",
  ReactiveCallbackHandled: "Reactive callback",
  Credited: "Payout held as claimable credit",
};

function Timeline({ id }: { id: bigint }) {
  const logs = useVaultLogs();
  const items = useMemo(
    () =>
      (logs.data ?? []).filter((l) => {
        const a = (l as VaultLog).args as { taskId?: bigint };
        return a && a.taskId === id && l.eventName in eventCopy;
      }),
    [logs.data, id],
  );
  return (
    <Card>
      <CardHeader title="Lifecycle history" description="Every vault event for this task, oldest first. Rebuilt from chain logs on each visit." />
      {logs.isLoading ? (
        <div className="p-5"><Skeleton className="h-24" /></div>
      ) : items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-fg-muted">No events found.</p>
      ) : (
        <ol className="divide-y divide-border">
          {items.map((l) => (
            <TimelineRow key={`${l.transactionHash}-${l.logIndex}`} l={l} />
          ))}
        </ol>
      )}
    </Card>
  );
}

function TimelineRow({ l }: { l: VaultLog }) {
  const ts = useBlockTime("dest", l.blockNumber);
  const a = l.args as Record<string, unknown>;
  let extra: string | null = null;
  if (l.eventName === "MilestoneReleased") extra = `#${Number(a.milestoneIndex) + 1} · ${fmtToken(a.amount as bigint)}${a.viaReactive ? " · verified, paid by Reactive callback" : " · owner override (no verifier, not a Reactive callback)"}`;
  if (l.eventName === "SessionExecuted") extra = fmtToken(a.spent as bigint);
  if (l.eventName === "Settled") extra = `released ${fmtToken(a.released as bigint)}, returned ${fmtToken(a.refunded as bigint)}`;
  if (l.eventName === "TaskClosed") extra = stateCopy[Number(a.finalState) as TaskState].label;
  if (l.eventName === "ReactiveCallbackHandled")
    extra = `${callbackKindLabel[Number(a.kind) as 0 | 1 | 2]} · ${callbackResultCopy[Number(a.result) as CallbackResult].label} · origin ${uintToHash(a.originTxHash as bigint).slice(0, 10)}…`;
  return (
    <li className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-medium">{eventCopy[l.eventName]}</div>
        {extra && <div className="text-xs text-fg-muted">{extra}</div>}
      </div>
      <div className="flex items-center gap-2 text-xs text-fg-subtle">
        {ts.data ? relTime(ts.data) : "…"}
        <Hex value={l.transactionHash} kind="tx" chainId={destination.id} />
      </div>
    </li>
  );
}
