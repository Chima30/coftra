import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SCENARIOS } from "@/lib/evidence";
import { ScenarioDetailView } from "@/views/proof-scenario";

// One static page per recorded loop: /proof/checkpoint, /proof/project-closeout, /proof/session-closeout, /proof/fallback.
export function generateStaticParams() {
  return SCENARIOS.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) return {};
  const title = `${s.engine}: ${s.title} · Coftra verified demo`;
  const description = `${s.summary} Real Base Sepolia and Reactive Lasna transactions, re-checked live; no wallet needed.`;
  return {
    title,
    description,
    alternates: { canonical: `/proof/${s.id}` },
    openGraph: { title, description, url: `/proof/${s.id}`, type: "article", siteName: "Coftra" },
    twitter: { card: "summary", title, description },
  };
}

// params are read inside Suspense so navigation between proof pages stays instant (Cache Components).
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Scenario params={params} />
    </Suspense>
  );
}

async function Scenario({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SCENARIOS.some((s) => s.id === id)) notFound();
  return <ScenarioDetailView id={id} />;
}
