import type { TaskLike } from "./roles";
import { taskStory, type StoryLog } from "./story";

export type ReactiveNotice = {
  /** Stable key so the same chain event is never announced twice. */
  key: string;
  taskId: bigint;
  /** Plain sentences from the task story, e.g. "Ada was paid 30 tUSDC after Sam confirmed checkpoint 1. …" */
  text: string;
  tx: string;
};

/**
 * What Reactive Network just did for your tasks, one notice per task per transaction.
 * Only steps the story marks as automatic count (a Reactive callback in the same transaction that changed the
 * task), so your own manual actions and callbacks the vault refused never produce a notice.
 */
export function reactiveNotices(tasks: readonly TaskLike[], logs: readonly StoryLog[], me?: string, names: Record<string, string> = {}): ReactiveNotice[] {
  const out: ReactiveNotice[] = [];
  for (const t of tasks) {
    const byTx = new Map<string, string[]>();
    for (const s of taskStory(t, logs, me, names)) {
      if (!s.automatic) continue;
      byTx.set(s.tx, [...(byTx.get(s.tx) ?? []), s.text]);
    }
    for (const [tx, lines] of byTx) out.push({ key: `${t.id}-${tx}`, taskId: t.id, text: lines.join(" "), tx });
  }
  return out;
}
