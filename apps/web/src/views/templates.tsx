import Link from "next/link";
import { Flag, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Card, buttonStyles } from "@/components/ui/primitives";

const templates = [
  {
    key: "project",
    icon: Flag,
    name: "Conditional Project Budget",
    engines: "CHECKPOINT → CLOSEOUT, or FALLBACK",
    who: "Paying a freelancer, a grant recipient or a contributor in stages.",
    example:
      "100 tUSDC for a design job. Checkpoint 1 pays 30 after the reviewer attests the drafts; checkpoint 2 pays 50 after final files. 20 is a reserve that always comes back. If the deadline passes before checkpoint 2, the 30 already paid stands and the remaining 70 returns.",
    enforces: [
      "Only the named verifier can trigger an automatic payout, and each checkpoint pays only once",
      "Payouts only go to the recipient set at creation",
      "No payout after the deadline; no way to reopen a closed task",
      "The owner can't pull the budget back mid-task. The owner can pay a checkpoint early as a manual override: it skips the verifier, is not a Reactive callback, and can only pay the fixed recipient",
    ],
  },
  {
    key: "session",
    icon: KeyRound,
    name: "Temporary Spending Session",
    engines: "CLOSEOUT, or FALLBACK",
    who: "Letting a bot or a friend do one paid action for you without handing over your wallet.",
    example:
      "Deposit 40 tUSDC so a minting bot can buy one demo NFT (25 tUSDC) for you. The NFT goes straight to your address. When the mint is observed on-chain, the bot loses access and the remaining 15 comes back automatically.",
    enforces: [
      "Exactly one target contract and one function, with you as the recipient",
      "A hard spending cap and deadline, checked by the vault on every call",
      "Token approvals are exact and reset to zero after each call",
      "You can cancel at any time and get the unspent balance back",
    ],
  },
];

export function TemplatesView() {
  return (
    <>
      <PageHeader
        title="Templates"
        description="Two reusable rules that the vault can enforce completely. Anything it can't enforce securely is not offered."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {templates.map(({ key, icon: Icon, name, engines, who, example, enforces }) => (
          <Card key={key} className="flex flex-col p-6">
            <Icon className="size-6 text-accent" />
            <h2 className="mt-3 text-2xl">{name}</h2>
            <div className="mt-1 font-mono text-xs text-fg-subtle">{engines}</div>
            <p className="mt-3 text-sm text-fg-muted">
              <span className="font-medium text-fg">Good for: </span>
              {who}
            </p>
            <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm leading-relaxed text-fg-muted">{example}</p>
            <h3 className="mt-4 text-lg">Enforced on-chain</h3>
            <ul className="mt-2 flex-1 space-y-1.5 text-sm text-fg-muted">
              {enforces.map((e) => (
                <li key={e} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-fg-subtle" aria-hidden />
                  {e}
                </li>
              ))}
            </ul>
            <Link href={`/create?template=${key}`} className={buttonStyles({ className: "mt-6 self-start" })}>
              Use this template
            </Link>
          </Card>
        ))}
      </div>
      <Card className="mt-6 p-6 text-sm leading-relaxed text-fg-muted">
        <h2 className="text-xl text-fg">What Coftra will not do</h2>
        <p className="mt-2">
          It doesn&apos;t control your wallet, can&apos;t reverse confirmed transactions, and can&apos;t recover funds held by other protocols. It only
          manages what you deposit into the vault, under the rules you see before signing. Arbitrary contract calls, delegatecall and open-ended
          approvals are rejected by design.
        </p>
      </Card>
    </>
  );
}
