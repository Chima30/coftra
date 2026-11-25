import type { Metadata } from "next";
import { VaultsView } from "@/views/vaults";

export const metadata: Metadata = {
  title: "My Vaults — Coftra",
  description: "Every task you created or take part in, read live from the vault.",
};

export default function Page() {
  return <VaultsView />;
}
