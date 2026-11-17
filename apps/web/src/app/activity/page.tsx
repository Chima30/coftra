import { Suspense } from "react";
import { ActivityView } from "@/views/activity";

export default function Page() {
  return (
    <Suspense>
      <ActivityView />
    </Suspense>
  );
}
