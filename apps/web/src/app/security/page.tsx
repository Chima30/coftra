import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, Radio } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Badge, Card, buttonStyles } from "@/components/ui/primitives";
import { DEFENCES, testUrl } from "@/lib/security";
import { LINKS } from "@/lib/evidence";

export const metadata: Metadata = {
  title: "Security — Coftra",
  description: "Attacks Coftra has been tested against, what stops each one, and the tests behind every claim.",
};

export default function Page() {
  const tests = new Set(DEFENCES.flatMap((d) => d.tests.map((t) => t.name))).size;
  return (
    <>
      <PageHeader
        title="Security"
        description={`${DEFENCES.length} ways someone might try to move a task's money, what stops each one, and the evidence. Every entry cites real Foundry tests (${tests} in all), which run in CI on every push; some also cite what was checked on testnet.`}
        action={
          <Link href="/verify" className={buttonStyles({ variant: "secondary" })}>
            Verify a task yourself
          </Link>
        }
      />
      <div className="space-y-3">
        {DEFENCES.map((d) => (
          <Card key={d.attack} className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-lg">{d.attack}</h2>
              <Badge tone="success">Stopped · {d.stoppedBy}</Badge>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">{d.how}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {d.tests.map((t) => (
                <a key={t.name} href={testUrl(t)} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 font-mono text-[11px] text-fg-muted hover:border-fg/40 hover:text-fg">
                  <FlaskConical className="size-3" aria-hidden />
                  {t.name}
                </a>
              ))}
            </div>
            {d.onTestnet && (
              <p className="mt-3 flex gap-2 text-[13px] text-fg-muted">
                <Radio className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>
                  <span className="font-medium text-fg">Checked on testnet: </span>
                  {d.onTestnet}
                </span>
              </p>
            )}
          </Card>
        ))}
      </div>
      <p className="mt-6 text-xs text-fg-subtle">
        Coftra is unaudited testnet software. These tests show the listed attacks fail; they don&apos;t prove there are no others. Source:{" "}
        <a href={LINKS.github} className="underline" target="_blank" rel="noreferrer">
          GitHub
        </a>
        .
      </p>
    </>
  );
}
