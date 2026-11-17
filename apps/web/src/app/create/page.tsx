import { Suspense } from "react";
import { CreateView } from "@/views/create";

export default function Page() {
  return (
    <Suspense>
      <CreateView />
    </Suspense>
  );
}
