import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { Card, buttonStyles } from "./ui/primitives";

/* Editorial landing sections for visitors without a wallet. Static and wallet-free, so they prerender. */

export function Hero() {
  return (
    <section className="relative overflow-hidden rounded-[40px] border border-border bg-surface px-6 py-12 sm:px-12 sm:py-16 lg:py-20">
      <div className="atmosphere" aria-hidden />
      <div className="relative max-w-3xl">
        <p className="text-xs uppercase tracking-[0.16em] text-fg-subtle">Coftra · set it and forget it</p>
        <h1 className="mt-5 text-[44px] leading-[1.05] text-fg sm:text-6xl lg:text-[72px]">
          On-chain tasks that <em className="italic">finish themselves.</em>
        </h1>
        <p className="mt-6 max-w-xl text-[13px] leading-relaxed text-fg-muted sm:text-sm">
          A transaction is only the start. Someone still has to check the outcome, release payments, revoke temporary
          permissions and recover leftover funds. Coftra does those steps for you, triggered by verifiable blockchain
          events through Reactive Network, and leaves a proof trail anyone can check.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/create" className={buttonStyles({ size: "lg" })}>
            Create automation <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href="/proof" className={buttonStyles({ variant: "secondary", size: "lg" })}>
            <BadgeCheck className="size-4" aria-hidden /> Explore verified proof
          </Link>
        </div>
        <p className="mt-4 text-xs text-fg-subtle">The verified proof needs no wallet. Every transaction opens on its block explorer.</p>
      </div>
    </section>
  );
}

/* Small original illustrations, one per engine. Geometric, pastel, decorative only. */
function CheckpointArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-20 w-auto" aria-hidden>
      <circle cx="40" cy="40" r="30" fill="var(--periwinkle)" />
      <circle cx="80" cy="40" r="30" fill="none" stroke="var(--fg)" strokeWidth="1" />
      <path d="M68 41l8 8 15-17" fill="none" stroke="var(--fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CloseoutArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-20 w-auto" aria-hidden>
      <rect x="18" y="14" width="52" height="52" rx="26" fill="var(--mint)" />
      <path d="M92 28a22 22 0 1 0 4 20" fill="none" stroke="var(--fg)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="96" cy="48" r="4" fill="var(--fg)" />
    </svg>
  );
}
function FallbackArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-20 w-auto" aria-hidden>
      <circle cx="78" cy="40" r="28" fill="var(--gold)" />
      <circle cx="46" cy="40" r="26" fill="none" stroke="var(--fg)" strokeWidth="1" />
      <path d="M46 24v16l10 7" fill="none" stroke="var(--fg)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="96" cy="22" r="6" fill="var(--coral)" />
    </svg>
  );
}

const engines = [
  {
    art: CheckpointArt,
    name: "CHECKPOINT",
    title: "Pay for what's confirmed",
    body: "A verifier you name attests a milestone on-chain. Reactive Network relays it, and the vault releases exactly that milestone's amount. Once.",
  },
  {
    art: CloseoutArt,
    name: "CLOSEOUT",
    title: "End it when it's done",
    body: "When the outcome you funded happens on-chain, the task finalises: temporary spending rights are revoked and leftovers go back.",
  },
  {
    art: FallbackArt,
    name: "FALLBACK",
    title: "Recover if it doesn't",
    body: "If the deadline passes first, a Reactive Cron check expires the task. Completed payouts stand; everything unspent is returned.",
  },
];

export function Engines() {
  return (
    <section aria-labelledby="engines-title" className="space-y-6">
      <div className="max-w-2xl">
        <h2 id="engines-title" className="text-4xl text-fg sm:text-[44px]">Three engines, one rule.</h2>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">Every Coftra task is enforced by the same three steps, each triggered by a real event rather than by this website.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {engines.map(({ art: Art, name, title, body }) => (
          <Card key={name} className="flex flex-col rounded-[32px] p-6 sm:p-7">
            <Art />
            <div className="mt-6 text-[11px] font-medium tracking-[0.14em] text-fg-subtle">{name}</div>
            <h3 className="mt-2 text-[28px] text-fg">{title}</h3>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">{body}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

const flow = [
  { n: "01", title: "Origin event", body: "Something happens on Base Sepolia: a verifier attests, an outcome lands, or a deadline passes.", tint: "bg-periwinkle" },
  { n: "02", title: "Reactive Network", body: "Coftra's reactive contract on Lasna sees the event and decides, by its rule, whether to act.", tint: "bg-sky" },
  { n: "03", title: "Coftra callback", body: "It requests a callback. The vault checks the sender and the task's state before moving anything.", tint: "bg-mint" },
  { n: "04", title: "Verified outcome", body: "Funds move exactly as the rule says, and every hop is a transaction you can open.", tint: "bg-gold" },
];

/** Origin event → Reactive Network → Coftra callback → Verified outcome. Horizontal on wide screens, stacked on phones. */
export function Workflow() {
  return (
    <section aria-labelledby="flow-title" className="rounded-[40px] border border-border bg-surface px-6 py-10 sm:px-10">
      <h2 id="flow-title" className="max-w-xl text-4xl text-fg sm:text-[44px]">How a task finishes without you.</h2>
      <ol className="mt-10 grid gap-0 lg:grid-cols-4 lg:gap-4">
        {flow.map((s, i) => (
          <li key={s.n} className="relative flex gap-5 pb-8 last:pb-0 lg:flex-col lg:gap-0 lg:pb-0">
            {/* connector: vertical line on phones, horizontal on wide screens */}
            {i < flow.length - 1 && (
              <>
                <span className="absolute left-[19px] top-10 h-[calc(100%-40px)] w-px bg-border-strong lg:hidden" aria-hidden />
                <span className="absolute left-12 right-0 top-5 hidden h-px bg-border-strong lg:block" aria-hidden />
              </>
            )}
            <span className={`relative z-[1] flex size-10 shrink-0 items-center justify-center rounded-full ${s.tint} text-xs font-medium text-[#242424]`}>
              {s.n}
            </span>
            <div className="lg:mt-6 lg:pr-4">
              <h3 className="text-2xl text-fg">{s.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-6 text-xs text-fg-muted">
        <span>Measured on testnet: callbacks land about 1–3 seconds after the origin event.</span>
        <Link href="/proof" className="inline-flex min-h-6 items-center gap-1 text-accent underline-offset-4 hover:underline">
          See the four recorded runs <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
