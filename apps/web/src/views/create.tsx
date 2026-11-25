"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { isAddress, parseEventLogs } from "viem";
import { Check, Flag, KeyRound, Minus, Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { RequireWallet } from "@/components/states";
import { Badge, Button, Card, CardHeader, Field, Input, Notice, buttonStyles } from "@/components/ui/primitives";
import { TxStatusLine } from "@/components/tx-status";
import { Hex } from "@/components/hex";
import { useFundingAssessment } from "@/components/funding";
import { deploymentInfo } from "@/hooks/use-coftra";
import { useTx } from "@/hooks/use-tx";
import { useNow } from "@/hooks/use-now";
import { saveTaskLabel } from "@/lib/labels";
import { RuleDiagramView } from "@/components/rule-diagram";
import { SafetyInspector } from "@/components/safety-inspector";
import { hasWarnings, inspectRule, type Finding } from "@/lib/inspect";
import { approveArgs, projectCreateArgs, sessionCreateArgs } from "@/lib/tx-builders";
import { mockUsdcAbi, vaultAbi } from "@/lib/contracts";
import { destination } from "@/lib/chains";
import { cn, fmtDate, fmtToken, parseToken } from "@/lib/format";
import { TaskKind, kindLabel } from "@/lib/protocol";
import { maxSpend, ruleSentences, type RuleInput } from "@/lib/summary";

const steps = ["Template", "Rules", "Deadline & fallback", "Review", "Fund & activate"] as const;

type Milestone = { amount: string; verifier: string };

type Preset =
  | { id: string; title: string; body: string; label: string; kind: TaskKind.ProjectBudget; budget: string; milestones: string[]; durationSec: number }
  | { id: string; title: string; body: string; label: string; kind: TaskKind.SpendingSession; budget: string; cap: string; durationSec: number };

// Short deadlines on purpose: while any task is open the automation reserve is billed (see Funding Health).
const PRESETS: Preset[] = [
  {
    id: "freelancer",
    title: "Pay a freelancer in two stages",
    body: "100 tUSDC: 30 after drafts, 50 after final files, 20 kept back. 1-hour deadline.",
    label: "Freelancer, two stages",
    kind: TaskKind.ProjectBudget,
    budget: "100",
    milestones: ["30", "50"],
    durationSec: 3600,
  },
  {
    id: "grant",
    title: "Grant with three milestones",
    body: "300 tUSDC split evenly across three verified milestones. 4-hour deadline.",
    label: "Grant, three milestones",
    kind: TaskKind.ProjectBudget,
    budget: "300",
    milestones: ["100", "100", "100"],
    durationSec: 4 * 3600,
  },
  {
    id: "bot-mint",
    title: "Let a bot mint one NFT for me",
    body: "40 tUSDC deposit, the bot may spend 25 on one mint to you; 15 comes back.",
    label: "Bot mints one NFT",
    kind: TaskKind.SpendingSession,
    budget: "40",
    cap: "25",
    durationSec: 3600,
  },
  {
    id: "fallback-demo",
    title: "Watch FALLBACK refund itself",
    body: "20 tUSDC, one checkpoint, 15-minute deadline. Don't attest; it expires and refunds by itself.",
    label: "Fallback demo",
    kind: TaskKind.ProjectBudget,
    budget: "20",
    milestones: ["10"],
    durationSec: 15 * 60,
  },
];

const MIN_LEAD_SECONDS = 5 * 60; // contract minimum is 2 min; leave room for wallet + inclusion

function toLocalInput(ts: number) {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateView() {
  return (
    <>
      <PageHeader
        title="Create Automation"
        description="Build a rule from a supported template. Everything you set here is enforced by the vault contract, and you'll see it in plain language before signing."
      />
      <RequireWallet why="Creating a task deposits test funds from your wallet into the vault. Connect a wallet on Base Sepolia to continue.">
        <Builder />
      </RequireWallet>
    </>
  );
}

function Builder() {
  const { assessment: fundingAssessment } = useFundingAssessment();
  const d = deploymentInfo!;
  const { address } = useAccount();
  const params = useSearchParams();
  const initialKind = params.get("template") === "session" ? TaskKind.SpendingSession : TaskKind.ProjectBudget;

  const [step, setStep] = useState(params.get("template") ? 1 : 0);
  const [kind, setKind] = useState<TaskKind>(initialKind);

  // project
  const [recipient, setRecipient] = useState("");
  const [milestones, setMilestones] = useState<Milestone[]>([
    { amount: "30", verifier: address ?? "" },
    { amount: "50", verifier: address ?? "" },
  ]);
  const [budget, setBudget] = useState("100");

  // session
  const [executor, setExecutor] = useState("");
  // The vault requires the beneficiary to be the task owner, so it is always the connected wallet.
  const beneficiary = address ?? "";
  const [spendCap, setSpendCap] = useState("25");
  const [sessionBudget, setSessionBudget] = useState("40");

  // shared
  const [taskLabel, setTaskLabel] = useState("");
  const [deadline, setDeadline] = useState(() => toLocalInput(Math.floor(Date.now() / 1000) + 30 * 60));
  const [refundTo, setRefundTo] = useState(address ?? "");

  const nowTs = useNow(5_000);
  const deadlineTs = Math.floor(new Date(deadline).getTime() / 1000);

  const errors = useMemo(() => {
    const e: Record<string, string | null> = {};
    const addr = (v: string) => (isAddress(v) ? null : "Enter a valid 0x address.");
    if (kind === TaskKind.ProjectBudget) {
      e.recipient = addr(recipient);
      const b = parseToken(budget);
      e.budget = b ? null : "Enter an amount greater than zero.";
      let sum = 0n;
      milestones.forEach((m, i) => {
        const a = parseToken(m.amount);
        e[`m${i}a`] = a ? null : "Amount must be greater than zero.";
        e[`m${i}v`] = addr(m.verifier);
        if (a) sum += a;
      });
      if (b && sum > b) e.budget = `Milestones total ${fmtToken(sum)}, more than the budget.`;
    } else {
      e.executor = addr(executor);
      e.beneficiary = addr(beneficiary);
      if (isAddress(executor) && executor.toLowerCase() === beneficiary.toLowerCase())
        e.executor = "Use a different address from your own: a session limits what a third party can spend.";
      const cap = parseToken(spendCap);
      const b = parseToken(sessionBudget);
      e.spendCap = cap ? null : "Enter an amount greater than zero.";
      e.sessionBudget = b ? (cap && cap > b ? "The budget must cover the spending cap." : null) : "Enter an amount greater than zero.";
    }
    e.refundTo = addr(refundTo);
    const now = nowTs;
    e.deadline = !deadlineTs || deadlineTs < now + MIN_LEAD_SECONDS ? "Pick a time at least 5 minutes from now." : deadlineTs > now + 365 * 86400 ? "Maximum is 365 days." : null;
    return e;
  }, [kind, recipient, budget, milestones, executor, beneficiary, spendCap, sessionBudget, refundTo, deadlineTs, nowTs]);

  const stepValid = (s: number) => {
    const keys =
      s === 1
        ? kind === TaskKind.ProjectBudget
          ? ["recipient", "budget", ...milestones.flatMap((_, i) => [`m${i}a`, `m${i}v`])]
          : ["executor", "beneficiary", "spendCap", "sessionBudget"]
        : s === 2
          ? ["deadline", "refundTo"]
          : [];
    return keys.every((k) => !errors[k]);
  };

  const rule: RuleInput | null = useMemo(() => {
    if (!stepValid(1) || !stepValid(2)) return null;
    if (kind === TaskKind.ProjectBudget)
      return {
        kind,
        amount: parseToken(budget)!,
        recipient,
        refundTo,
        deadline: deadlineTs,
        milestones: milestones.map((m) => ({ amount: parseToken(m.amount)!, verifier: m.verifier })),
      };
    return {
      kind,
      amount: parseToken(sessionBudget)!,
      refundTo,
      deadline: deadlineTs,
      executor,
      target: d.demoNft,
      beneficiary,
      spendCap: parseToken(spendCap)!,
      operation: "mint(beneficiary)",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, budget, recipient, refundTo, deadlineTs, milestones, sessionBudget, executor, beneficiary, spendCap, errors]);

  const findings = useMemo(
    () => (rule && address ? inspectRule(rule, { owner: address, nowTs, runwayHours: fundingAssessment?.runwayHoursWhileOpen }) : []),
    [rule, address, nowTs, fundingAssessment?.runwayHoursWhileOpen],
  );

  const [touched, setTouched] = useState(false);
  const show = (k: string) => (touched ? errors[k] : null);
  const next = () => {
    setTouched(true);
    if (stepValid(step)) {
      setTouched(false);
      setStep((s) => Math.min(s + 1, steps.length - 1));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1" aria-label="Steps">
        {steps.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm",
                i === step ? "bg-surface font-medium text-fg ring-1 ring-border" : i < step ? "text-fg-muted hover:text-fg" : "text-fg-subtle",
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                  i < step ? "border-accent bg-accent text-accent-fg" : i === step ? "border-accent text-accent" : "border-border-strong",
                )}
              >
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="min-w-0 space-y-4">
        {step === 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { k: TaskKind.ProjectBudget, icon: Flag, body: "Pay a recipient milestone by milestone, each released only after a verifier you choose attests it on-chain. Leftovers come back." },
              { k: TaskKind.SpendingSession, icon: KeyRound, body: "Let a bot or helper spend a capped amount on one specific action, such as minting an NFT for you. Access ends automatically when the outcome happens." },
            ].map(({ k, icon: Icon, body }) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setStep(1);
                }}
                className={cn("rounded-lg border bg-surface p-5 text-left transition-colors hover:border-accent", kind === k ? "border-accent" : "border-border")}
              >
                <Icon className="size-5 text-accent" />
                <div className="mt-3 font-medium">{kindLabel[k]}</div>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">{body}</p>
              </button>
            ))}
          </div>
        )}

        {step === 0 && (
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Or start from a preset</h2>
            <p className="mt-0.5 text-sm text-fg-muted">Fills in a typical setup; you can change every value before signing.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    const now = Math.floor(Date.now() / 1000);
                    setKind(p.kind);
                    setTaskLabel(p.label);
                    setDeadline(toLocalInput(now + p.durationSec));
                    if (p.kind === TaskKind.ProjectBudget) {
                      setBudget(p.budget);
                      setMilestones(p.milestones.map((amount) => ({ amount, verifier: address ?? "" })));
                    } else {
                      setSessionBudget(p.budget);
                      setSpendCap(p.cap);
                    }
                    setStep(1);
                  }}
                  className="rounded-md border border-border p-3 text-left text-sm transition-colors hover:border-accent"
                >
                  <div className="font-medium">{p.title}</div>
                  <div className="mt-0.5 text-[13px] text-fg-muted">{p.body}</div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {step === 1 && (
          <Card className="p-5">
            <Field
              label="Name (optional, private)"
              htmlFor="task-label"
              hint="Only saved in this browser to help you recognise the task. The contract stores no names; on-chain it is identified by its number."
            >
              <Input id="task-label" maxLength={60} value={taskLabel} onChange={(e) => setTaskLabel(e.target.value)} placeholder="e.g. Logo design for Ada" />
            </Field>
          </Card>
        )}

        {step === 1 && kind === TaskKind.ProjectBudget && (
          <Card>
            <CardHeader title="Budget, recipient and checkpoints" description="Each checkpoint has an amount and the address allowed to verify it." />
            <div className="space-y-5 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Recipient" htmlFor="recipient" hint="Who gets paid when checkpoints are verified." error={show("recipient")}>
                  <Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x…" spellCheck={false} />
                </Field>
                <Field label="Total budget (tUSDC)" htmlFor="budget" hint="Anything above the checkpoint total is a reserve that returns to you." error={show("budget")}>
                  <Input id="budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
                </Field>
              </div>
              <div className="space-y-3">
                {milestones.map((m, i) => (
                  <div key={i} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[1fr_2fr_auto] md:items-start">
                    <Field label={`Checkpoint ${i + 1} amount`} htmlFor={`ma${i}`} error={show(`m${i}a`)}>
                      <Input
                        id={`ma${i}`}
                        inputMode="decimal"
                        value={m.amount}
                        onChange={(e) => setMilestones((ms) => ms.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                      />
                    </Field>
                    <Field label="Verifier" htmlFor={`mv${i}`} hint="Their on-chain attestation is the only automatic trigger for this payout." error={show(`m${i}v`)}>
                      <Input
                        id={`mv${i}`}
                        value={m.verifier}
                        spellCheck={false}
                        onChange={(e) => setMilestones((ms) => ms.map((x, j) => (j === i ? { ...x, verifier: e.target.value } : x)))}
                      />
                    </Field>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="md:mt-7"
                      aria-label={`Remove checkpoint ${i + 1}`}
                      disabled={milestones.length === 1}
                      onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))}
                    >
                      <Minus className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={milestones.length >= 10}
                  onClick={() => setMilestones((ms) => [...ms, { amount: "", verifier: address ?? "" }])}
                >
                  <Plus className="size-4" /> Add checkpoint
                </Button>
              </div>
              <Notice tone="neutral" title="Trust model">
                A verifier is a person or contract you trust to judge the work. Coftra guarantees that only that address can trigger the payout, only once, and only
                before the deadline. It cannot judge the quality of the work itself.
              </Notice>
            </div>
          </Card>
        )}

        {step === 1 && kind === TaskKind.SpendingSession && (
          <Card>
            <CardHeader title="Permitted spending" description="Exactly one operation is allowed. Anything else is rejected by the vault." />
            <div className="space-y-5 p-5">
              <div className="rounded-md border border-border bg-surface-2 p-4 text-sm">
                <div className="text-fg-muted">Permitted operation</div>
                <div className="mt-1 font-mono">CoftraDemoNFT.mint(beneficiary)</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                  Target <Hex value={d.demoNft} chainId={destination.id} /> · <Badge>Testnet demo collection</Badge>
                </div>
                <p className="mt-2 text-xs text-fg-subtle">
                  Sessions only support vetted targets. Arbitrary calls, delegatecall, token approvals and transfers are rejected by the contract.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Executor" htmlFor="executor" hint="The bot or helper allowed to spend. It never receives the NFT." error={show("executor")}>
                  <Input id="executor" value={executor} onChange={(e) => setExecutor(e.target.value)} placeholder="0x…" spellCheck={false} />
                </Field>
                <Field label="Beneficiary" htmlFor="beneficiary" hint="Always you, the task owner. Whatever the operation mints is sent straight to this address.">
                  <Input id="beneficiary" value={beneficiary} readOnly aria-readonly className="bg-surface-2 font-mono text-[13px]" />
                </Field>
                <Field label="Spending cap (tUSDC)" htmlFor="cap" hint="Hard limit across all executions. The demo NFT costs 25." error={show("spendCap")}>
                  <Input id="cap" inputMode="decimal" value={spendCap} onChange={(e) => setSpendCap(e.target.value)} />
                </Field>
                <Field label="Deposit (tUSDC)" htmlFor="sbudget" hint="Must cover the cap. Anything unspent comes back." error={show("sessionBudget")}>
                  <Input id="sbudget" inputMode="decimal" value={sessionBudget} onChange={(e) => setSessionBudget(e.target.value)} />
                </Field>
              </div>
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader title="Deadline and fallback" description="What happens if the outcome doesn't arrive in time." />
            <div className="space-y-5 p-5">
              <Field label="Deadline" htmlFor="deadline" hint="Checked against Base Sepolia time. Reactive Cron checks overdue tasks every ~2 minutes in this deployment." error={show("deadline")}>
                <Input id="deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                {[
                  ["15 min (demo)", 15 * 60],
                  ["1 hour", 3600],
                  ["4 hours", 4 * 3600],
                  ["1 day", 86400],
                ].map(([l, s]) => (
                  <Button key={l as string} variant="secondary" size="sm" onClick={() => setDeadline(toLocalInput(Math.floor(Date.now() / 1000) + (s as number)))}>
                    {l}
                  </Button>
                ))}
              </div>
              <Field label="Fallback: return unspent funds to" htmlFor="refund" hint="Used on completion, expiry and cancellation. Completed payouts are never clawed back." error={show("refundTo")}>
                <Input id="refund" value={refundTo} onChange={(e) => setRefundTo(e.target.value)} spellCheck={false} />
              </Field>
              {fundingAssessment && (deadlineTs - nowTs) / 3600 > fundingAssessment.runwayHoursWhileOpen && (
                <Notice tone="warning" title="This deadline outlasts the current automation reserve">
                  While any task is open, the reactive contract pays for a deadline check about every 2 minutes. At the measured testnet rate, its
                  reserve covers about {fundingAssessment.runwayHoursWhileOpen.toFixed(1)} hours of that. If it runs out before your deadline, automation
                  pauses for every task until someone tops it up. Your funds stay safe, and the manual fallback still works 30 minutes after the deadline.
                  Shorter deadlines are more reliable on this testnet deployment.
                </Notice>
              )}
              <Notice tone="neutral" title="Supported fallback">
                On expiry, the vault freezes further payouts, revokes any executor and returns the unspent balance to the address above. If automation is
                ever unavailable, anyone can run the same fallback by hand 30 minutes after the deadline.
              </Notice>
            </div>
          </Card>
        )}

        {(step === 1 || step === 2) && rule && <RuleDiagramView rule={rule} />}
        {step === 3 && rule && <RuleDiagramView rule={rule} onEdit={(st) => setStep(st)} />}
        {step === 3 && rule && <Review rule={rule} findings={findings} />}
        {step === 4 && rule && <FundAndActivate rule={rule} label={taskLabel} findings={findings} />}

        {step > 0 && step < 4 && (
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
            <Button onClick={next}>{step === 3 ? "Continue to funding" : "Continue"}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Review({ rule, findings }: { rule: RuleInput; findings: Finding[] }) {
  const d = deploymentInfo!;
  const { assessment } = useFundingAssessment();
  const rows: [string, React.ReactNode][] =
    rule.kind === TaskKind.ProjectBudget
      ? [
          ["Recipient", <Hex key="r" value={rule.recipient} chainId={destination.id} />],
          ...rule.milestones.map((m, i) => [`Verifier, checkpoint ${i + 1}`, <Hex key={i} value={m.verifier} chainId={destination.id} />] as [string, React.ReactNode]),
          ["Permitted targets", "None. Payouts go only to the recipient."],
          ["Who can trigger a payout", "Automatically: only the named verifier, through Reactive Network. Manually: you, as owner override (skips the verifier, before the deadline, same fixed amount and recipient)."],
        ]
      : [
          ["Executor", <Hex key="e" value={rule.executor} chainId={destination.id} />],
          ["Beneficiary", <Hex key="b" value={rule.beneficiary} chainId={destination.id} />],
          ["Permitted target", <Hex key="t" value={rule.target} chainId={destination.id} />],
          ["Permitted call", <span key="c" className="font-mono text-[13px]">mint(beneficiary)</span>],
        ];
  rows.push(
    ["Maximum that can ever leave to others", <span key="m" className="tabular font-medium">{fmtToken(maxSpend(rule))}</span>],
    ["Asset", <span key="a" className="inline-flex items-center gap-2">tUSDC <Hex value={d.token} chainId={destination.id} /></span>],
    ["Deadline", fmtDate(rule.deadline)],
    ["Cancellation", rule.kind === TaskKind.ProjectBudget ? "Only before activation" : "Any time by you"],
    ["Unspent funds go to", <Hex key="rf" value={rule.refundTo} chainId={destination.id} />],
    ["Your costs", "Gas for two Base Sepolia transactions you sign (approve, create). Reactive execution and callback fees are paid from protocol balances, never from your deposit."],
    ["Vault", <Hex key="v" value={d.vault} chainId={destination.id} />],
  );
  return (
    <div className="space-y-4">
      <SafetyInspector findings={findings} />
      <Card>
        <CardHeader title="Safety preview" description="This is what the contract will enforce. Read it before you sign." />
        <ul className="space-y-2.5 p-5 text-[15px] leading-relaxed">
          {ruleSentences(rule).map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Parties and permissions" />
        <dl className="divide-y divide-border">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-5 py-2.5 text-sm sm:grid-cols-[240px_1fr]">
              <dt className="text-fg-muted">{k}</dt>
              <dd className="min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {assessment && !assessment.canActivate ? (
        <Notice tone="danger" title="Automation is underfunded right now">
          {assessment.reactive === "blocked" ? "The reactive contract on Lasna has debt or is paused, so it would not react to your task's events. " : ""}
          {assessment.callbacks === "blocked" ? "The vault has callback debt on Base Sepolia, so callbacks would not be delivered. " : ""}
          You can still create the task, but activation is blocked until funding recovers. See Settings → Funding health.
        </Notice>
      ) : (
        <Notice tone="neutral" title="Costs">
          You pay normal Base Sepolia gas for two transactions: an exact-amount token approval and the create call. Reactive execution and callbacks are
          paid from the protocol&apos;s funded balances
          {assessment ? `, currently estimated at ≈${(Number(assessment.perCallback) / 1e18).toFixed(8)} ETH per callback` : ""}.
        </Notice>
      )}
    </div>
  );
}

function FundAndActivate({ rule, label, findings }: { rule: RuleInput; label: string; findings: Finding[] }) {
  const mustAck = hasWarnings(findings);
  const [ackWarnings, setAckWarnings] = useState(false);
  const d = deploymentInfo!;
  const { address } = useAccount();
  const { assessment } = useFundingAssessment();
  const approve = useTx();
  const create = useTx();
  const faucet = useTx();
  const [createdId, setCreatedId] = useState<bigint | null>(null);

  const reads = useReadContracts({
    contracts: [
      { address: d.token, abi: mockUsdcAbi, functionName: "balanceOf", args: [address!] },
      { address: d.token, abi: mockUsdcAbi, functionName: "allowance", args: [address!, d.vault] },
    ],
    query: { refetchInterval: 6_000 },
  });
  const balance = reads.data?.[0]?.result as bigint | undefined;
  const allowance = reads.data?.[1]?.result as bigint | undefined;
  const enough = balance !== undefined && balance >= rule.amount;
  const approved = allowance !== undefined && allowance >= rule.amount;
  const activateNow = assessment?.canActivate ?? false;

  const doCreate = async () => {
    const r =
      rule.kind === TaskKind.ProjectBudget
        ? await create.run("Create project task", {
            address: d.vault,
            abi: vaultAbi,
            functionName: "createProjectTask",
            args: projectCreateArgs(rule, d.token, activateNow),
          })
        : await create.run("Create spending session", {
            address: d.vault,
            abi: vaultAbi,
            functionName: "createSessionTask",
            args: sessionCreateArgs(rule, d.token, activateNow),
          });
    if (r) {
      const ev = parseEventLogs({ abi: vaultAbi, logs: r.logs, eventName: "TaskCreated" })[0];
      if (ev) {
        setCreatedId(ev.args.taskId);
        if (label.trim()) saveTaskLabel(ev.args.taskId.toString(), label);
      }
    }
  };

  if (createdId !== null)
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-success">
          <Check className="size-5" />
          <span className="font-medium">Task #{createdId.toString()} created{activateNow ? " and activated" : ""}.</span>
        </div>
        <p className="mt-2 text-sm text-fg-muted">
          {activateNow
            ? "You can close this tab now. Reactive Network will pick up the activation event and start watching the deadline; the task page shows every step as it happens."
            : "It is funded but not active. Activate it from the task page once automation funding is healthy."}
        </p>
        <TxStatusLine status={create.status} hash={create.hash} />
        <Link href={`/tasks/${createdId}`} className={cn(buttonStyles(), "mt-4")}>
          Open task
        </Link>
      </Card>
    );

  return (
    <Card>
      <CardHeader title="Fund and activate" description="Two wallet confirmations. Nothing moves until you sign." />
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4">
          <div>
            <div className="text-sm text-fg-muted">Your tUSDC balance</div>
            <div className="tabular text-lg font-semibold">{fmtToken(balance)}</div>
          </div>
          {!enough && (
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={faucet.busy}
                onClick={() =>
                  faucet.run("Mint test tUSDC", { address: d.token, abi: mockUsdcAbi, functionName: "mint", args: [address!, 1_000_000_000n] })
                }
              >
                Get 1,000 test tUSDC
              </Button>
              <span className="text-xs text-fg-subtle">Testnet token with no value</span>
            </div>
          )}
        </div>
        <TxStatusLine status={faucet.status} hash={faucet.hash} error={faucet.error} slow={faucet.slow} />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">1. Approve exactly {fmtToken(rule.amount)}</div>
              <div className="text-sm text-fg-muted">The vault can pull this amount once. No unlimited allowance.</div>
            </div>
            {approved ? (
              <Badge tone="success">Approved</Badge>
            ) : (
              <Button
                disabled={!enough || approve.busy}
                onClick={() => approve.run("Approve tUSDC", { address: d.token, abi: mockUsdcAbi, functionName: "approve", args: approveArgs(rule, d.vault) })}
              >
                Approve
              </Button>
            )}
          </div>
          <TxStatusLine status={approve.status} hash={approve.hash} error={approve.error} slow={approve.slow} />
        </div>

        {mustAck && (
          <label className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={ackWarnings} onChange={(e) => setAckWarnings(e.target.checked)} />
            <span>
              I&apos;ve read the safety inspector&apos;s warning{findings.filter((x) => x.level === "warning").length > 1 ? "s" : ""} (
              {findings.filter((x) => x.level === "warning").map((x) => x.title).join("; ")}) and want to continue.
            </span>
          </label>
        )}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">2. Create {activateNow ? "and activate" : "(funded, not yet active)"}</div>
              <div className="text-sm text-fg-muted">
                Deposits {fmtToken(rule.amount)} into the vault under your rules.
                {!activateNow && " Activation is held back because automation funding is unhealthy."}
              </div>
            </div>
            <Button disabled={!approved || create.busy || (mustAck && !ackWarnings)} onClick={doCreate}>
              {activateNow ? "Create & activate" : "Create"}
            </Button>
          </div>
          <TxStatusLine status={create.status} hash={create.hash} error={create.error} slow={create.slow} />
        </div>
        {rule.kind === TaskKind.SpendingSession && (
          <p className="text-xs text-fg-subtle">
            The demo NFT is <Hex value={d.demoNft} chainId={destination.id} />. Mint price is read from the contract when the executor acts.
          </p>
        )}
      </div>
    </Card>
  );
}
