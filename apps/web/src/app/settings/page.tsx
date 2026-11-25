import type { Metadata } from "next";
import { SettingsView } from "@/views/settings";

export const metadata: Metadata = {
  title: "Settings — Coftra",
  description: "Contracts, automation funding, contacts and preferences.",
};

export default function Page() {
  return <SettingsView />;
}
