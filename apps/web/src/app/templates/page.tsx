import type { Metadata } from "next";
import { TemplatesView } from "@/views/templates";

export const metadata: Metadata = {
  title: "Templates — Coftra",
  description: "Ready-made automations: a conditional project budget and a temporary spending session.",
};

export default function Page() {
  return <TemplatesView />;
}
