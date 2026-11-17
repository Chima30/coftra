import { Suspense } from "react";
import { TaskView } from "@/views/task";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <TaskView params={params} />
    </Suspense>
  );
}
