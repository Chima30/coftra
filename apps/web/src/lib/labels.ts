"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Private task names. The vault stores no names (adding one would need a contract change), so labels live
 * only in this browser. They are a convenience, never a source of truth: tasks are always identified on-chain
 * by their number. Storage access is wrapped because it can be unavailable (private windows, blocked storage).
 */
const PREFIX = "coftra.label.v1.";
const EVENT = "coftra-labels";

function read(taskId: string): string {
  try {
    return localStorage.getItem(PREFIX + taskId) ?? "";
  } catch {
    return "";
  }
}

export function saveTaskLabel(taskId: string, label: string) {
  try {
    const clean = label.trim().slice(0, 60);
    if (clean) localStorage.setItem(PREFIX + taskId, clean);
    else localStorage.removeItem(PREFIX + taskId);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage unavailable: the label simply isn't kept */
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useTaskLabel(taskId: string | bigint) {
  const id = taskId.toString();
  const label = useSyncExternalStore(
    subscribe,
    () => read(id),
    () => "",
  );
  const set = useCallback((v: string) => saveTaskLabel(id, v), [id]);
  return [label, set] as const;
}
