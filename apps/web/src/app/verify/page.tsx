import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyView } from "@/views/verify";

export const metadata: Metadata = {
  title: "Verify a task — Coftra",
  description: "Check any Coftra task against the vault and its transaction receipts, without a wallet.",
};

export default function Page() {
  return (
    <Suspense>
      <VerifyView />
    </Suspense>
  );
}
