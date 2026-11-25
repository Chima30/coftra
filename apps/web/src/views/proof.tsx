"use client";

import Link from "next/link";
import { BookOpen, FolderGit2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { RecheckBanner, ScenarioCard } from "@/components/verified";
import { AutomationReplay } from "@/components/replay";
import { Hex } from "@/components/hex";
import { Card, CardHeader, buttonStyles } from "@/components/ui/primitives";
import { CONTRACTS, LINKS, OBSERVED_COSTS, SCENARIOS, sourcifyUrl } from "@/lib/evidence";
import { chainName } from "@/lib/chains";

const approaches = [
  {
    name: "Do it yourself",
    who: "You watch the chain and send each transaction by hand.",
    gap: "Nothing happens while you're away. A missed deadline means funds sit idle and a temporary permission stays open until you notice.",
  },
  {
    name: "Run your own keeper bot",
    who: "A server you operate polls the chains and sends transactions with its own hot key.",
    gap: "You pay for and secure an always-on server and a funded key. If it crashes or its RPC lags, nothing happens, and only you can tell.",
  },
  {
    name: "Reactive Network (Coftra)",
    who: "A reactive contract on Lasna is subscribed to the exact events that matter and to a cron schedule. It requests a callback; the vault checks and applies it.",
    gap: "Needs a funded reserve on Lasna and callback funds on the destination chain, and depends on Reactive Network being available. Coftra keeps manual recovery for when it isn't.",
  },
];

const recovery: { scenario: string; where: string; evidence: string }[] = [
  { scenario: "Same milestone attested twice", where: "Local test", evidence: "test_checkpoint_duplicateEventIsIdempotent: paid exactly once" },
  { scenario: "Callback from anyone but the Reactive proxy, or another reactive contract", where: "Local test", evidence: "test_auth_rejectsCallerOtherThanProxy, test_auth_rejectsOtherReactiveContract" },
  { scenario: "Look-alike event from an unauthorized contract", where: "Local test", evidence: "test_auth_forgedEventFromOtherEmitterIsIgnored: no callback requested" },
  { scenario: "Executor spends after the deadline or over the cap", where: "Local test", evidence: "test_session_localLimitsEnforced, test_session_delayedCallbackCannotExceedCap" },
  { scenario: "Executor spends after the session closed", where: "On-chain (read-only call)", evidence: "Task 3: second executeSession reverts with WrongState(3)" },
  { scenario: "Callbacks arriving after a task is closed", where: "Local test", evidence: "test_lateCallbacksAfterCloseChangeNothing" },
  { scenario: "Missed deadline", where: "On-chain", evidence: "FALLBACK loop above (task 2)" },
  { scenario: "Expiry callback lost or undelivered", where: "Local test", evidence: "test_fallback_retriesAfterIntervalUntilVaultAcks: re-requested until the vault confirms" },
  { scenario: "Automation unavailable entirely", where: "Local test", evidence: "test_fallback_manualRecoveryWhenAutomationIsDown: anyone can expire 30 min after the deadline" },
  { scenario: "Recipient's transfer fails", where: "Local test", evidence: "test_failedPayoutIsCreditedAndClaimableOnce: kept as claimable credit" },
  { scenario: "Reactive reserve runs low", where: "Observed on-chain", evidence: "Reserve fell while cron ran; topped up, and Funding Health now tracks reserves only" },
];

export function ProofView() {
  return (
    <>
      <PageHeader
        title="Verified demo"
        description="Four real automations, start to finish, on Base Sepolia and Reactive Lasna. No wallet needed: every transaction links to its block explorer and is re-checked live when you open this page."
      />
      <div className="space-y-6">
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <RecheckBanner />
            <p className="text-xs text-fg-subtle">
              These are recorded testnet runs from 17 Nov 2026, not live activity. Testnet tokens have no value.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={LINKS.judgeQuickstart} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <BookOpen className="size-4" /> 5-minute judge guide
            </a>
            <a href={LINKS.github} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              <FolderGit2 className="size-4" /> Source on GitHub
            </a>
          </div>
        </Card>

        <AutomationReplay />

        <nav aria-label="Scenarios" className="flex flex-wrap gap-2 text-sm">
          {SCENARIOS.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border border-border px-3 py-1 text-fg-muted hover:text-fg">
              {i + 1}. {s.engine === "CLOSEOUT" ? `CLOSEOUT (${s.id.startsWith("session") ? "session" : "project"})` : s.engine}
            </a>
          ))}
        </nav>

        <div className="space-y-4">
          {SCENARIOS.map((s) => (
            <ScenarioCard key={s.id} s={s} />
          ))}
        </div>

        <Card>
          <CardHeader title="Why Reactive Network" description="What changes when nobody has to be online." />
          <div className="grid gap-4 p-5 md:grid-cols-3">
            {approaches.map((a, i) => (
              <div key={a.name} className={i === 2 ? "rounded-2xl border border-fg/30 bg-surface-2 p-4" : "rounded-2xl border border-border p-4"}>
                <div className="font-medium">{a.name}</div>
                <p className="mt-1.5 text-sm text-fg-muted">{a.who}</p>
                <p className="mt-2 text-sm text-fg-muted">
                  <span className="font-medium text-fg">{i === 2 ? "Trade-off: " : "Gap: "}</span>
                  {a.gap}
                </p>
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-border px-5 py-4 text-sm text-fg-muted">
            <p>
              <span className="font-medium text-fg">Outside events.</span> The NFT collection and the verifier registry know nothing about Coftra. Reactive
              watches their events directly, so Coftra can react to outcomes it doesn&apos;t control.
            </p>
            <p>
              <span className="font-medium text-fg">Time.</span> Blockchains don&apos;t act on their own when a deadline passes. Reactive Cron supplies the
              tick, and the vault checks the deadline itself before expiring anything.
            </p>
            <p>
              <span className="font-medium text-fg">Trust stays on the vault.</span> Reactive only asks. Every callback is authenticated and re-checked
              against the vault&apos;s current rules, so a late, duplicate or forged request changes nothing.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="What it costs" description="Observed testnet values from the runs above. Not mainnet prices, and no dollar figures are implied." />
          <div className="grid gap-4 p-5 text-sm md:grid-cols-2">
            <dl className="space-y-2">
              {[
                ["Origin transaction", "Paid by whoever triggers it (verifier, bot, owner) in Base Sepolia ETH. Normal gas."],
                ["Reactive execution", `Billed to the reactive contract's reserve on Lasna in lREACT. ${OBSERVED_COSTS.reactionFee}; ${OBSERVED_COSTS.reactGas}.`],
                ["Scheduled checks (cron)", `Every tick is billed while a task is open. ${OBSERVED_COSTS.cronDrain}. Coftra unsubscribes when nothing is open.`],
                ["Destination callback", `Charged to the vault's callback balance. ${OBSERVED_COSTS.vaultCallbackSpend}; ${OBSERVED_COSTS.callbackGas}.`],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-medium">{k}</dt>
                  <dd className="text-fg-muted">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-4">
              <div>
                <div className="font-medium">Your task deposit is separate</div>
                <p className="mt-1 text-fg-muted">
                  Money you deposit into a task is held per task and is only ever paid to the recipient, spent by the session, or returned to your
                  refund address. Execution fees never come out of it.
                </p>
              </div>
              <div>
                <div className="font-medium">Execution fees are not refundable</div>
                <p className="mt-1 text-fg-muted">
                  lREACT spent on reactions and ETH spent on callbacks are consumed when automation runs. Funds sent to top up callback balance are
                  protocol operating funds, not a deposit you can withdraw.
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Failure and recovery"
            description="What happens when things go wrong. Only rows marked on-chain were observed on testnet; the rest are local Foundry tests running a simulated Reactive pipeline."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-fg-subtle">
                <tr className="border-b border-border">
                  <th className="px-5 py-2 font-medium">Scenario</th>
                  <th className="px-5 py-2 font-medium">Evidence type</th>
                  <th className="px-5 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recovery.map((r) => (
                  <tr key={r.scenario}>
                    <td className="px-5 py-2.5">{r.scenario}</td>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <span className={r.where.startsWith("On-chain") || r.where.startsWith("Observed") ? "text-success" : "text-fg-muted"}>{r.where}</span>
                    </td>
                    <td className="px-5 py-2.5 text-fg-muted">{r.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border px-5 py-3 text-xs text-fg-subtle">
            Run them yourself: <code className="font-mono">cd contracts &amp;&amp; forge test</code>. Details in{" "}
            <a href={LINKS.security} target="_blank" rel="noreferrer" className="underline">
              the security review
            </a>
            .
          </p>
        </Card>

        <Card>
          <CardHeader title="Deployed contracts" description="Testnet only. Every contract is source-verified on Sourcify (exact match)." action={<ShieldCheck className="size-5 text-fg-subtle" />} />
          <dl className="divide-y divide-border text-sm">
            {CONTRACTS.map((c) => (
              <div key={c.address} className="grid gap-1 px-5 py-2.5 sm:grid-cols-[260px_1fr]">
                <dt className="text-fg-muted">
                  {c.name} <span className="text-xs text-fg-subtle">· {chainName(c.chainId)}</span>
                </dt>
                <dd className="flex flex-wrap items-center gap-3">
                  <Hex value={c.address} chainId={c.chainId} full />
                  <a href={sourcifyUrl(c.chainId, c.address)} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center text-xs text-accent hover:underline">
                    verified source (Sourcify)
                  </a>
                  {c.source && (
                    <a href={c.source} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center text-xs text-fg-muted hover:underline">
                      GitHub
                    </a>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-5 text-sm text-fg-muted">
          <div className="font-medium text-fg">What this does not prove</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>That Reactive Network will always be available in future. Coftra keeps manual recovery paths for that case.</li>
            <li>That the code is audited. It has an internal security review only and has not been independently audited.</li>
            <li>That it has been tested by outside users. No user testing has been done yet.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/create" className={buttonStyles({ size: "sm" })}>
              Try it on testnet
            </Link>
            <Link href="/activity" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Browse all activity
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
