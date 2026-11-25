import type { Metadata } from "next";
import { Suspense } from "react";
import { TaskView } from "@/views/task";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return /^\d+$/.test(id)
    ? { title: `Task #${id} — Coftra`, description: `What happened to task #${id}, step by step, read live from the vault. No wallet needed.` }
    : {};
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <TaskView params={params} />
    </Suspense>
  );
}
