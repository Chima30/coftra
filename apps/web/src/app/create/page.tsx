import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateView } from "@/views/create";

export const metadata: Metadata = {
  title: "Create automation — Coftra",
  description: "Build a project budget or a spending session, check it with the safety inspector, and fund it.",
};

export default function Page() {
  return (
    <Suspense>
      <CreateView />
    </Suspense>
  );
}
