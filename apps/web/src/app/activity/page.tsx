import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell";
import { VerifiedShowcase } from "@/components/verified";
import { ActivityView } from "@/views/activity";

// The header and the verified showcase sit outside the Suspense boundary so they are prerendered into the
// HTML and visible immediately, with no wallet. Only the live list (which reads URL params) streams in.
export default function Page() {
  return (
    <>
      <PageHeader
        title="Automation Activity"
        description="The Proof Center. Every automated step, traced from the origin event through Reactive Network to the vault, rebuilt from chain data when you open it."
      />
      <div className="mb-6">
        <VerifiedShowcase />
      </div>
      <h2 className="mb-3 text-[15px] font-semibold">All callbacks, live from the chain</h2>
      <Suspense>
        <ActivityView />
      </Suspense>
    </>
  );
}
