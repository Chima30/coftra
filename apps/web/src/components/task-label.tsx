"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { useTaskLabel } from "@/lib/labels";
import { Button, Input } from "./ui/primitives";

/** Inline editor for a task's private, browser-only name. */
export function TaskLabelEditor({ taskId }: { taskId: bigint }) {
  const [label, setLabel] = useTaskLabel(taskId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (editing)
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setLabel(draft);
          setEditing(false);
        }}
      >
        <Input
          autoFocus
          aria-label="Private task name"
          maxLength={60}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 w-56"
          placeholder="e.g. Logo design for Ada"
        />
        <Button size="sm" type="submit">
          Save
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <span className="text-xs text-fg-subtle">Saved only in this browser.</span>
      </form>
    );

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(label);
        setEditing(true);
      }}
      className="inline-flex min-h-6 items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      title="Private name, saved only in this browser"
    >
      {label ? <span className="font-medium text-fg">{label}</span> : <span>Add a private name</span>}
      <Pencil className="size-3.5" />
    </button>
  );
}

/** Read-only label for lists; renders nothing when unnamed. */
export function TaskLabelText({ taskId }: { taskId: bigint }) {
  const [label] = useTaskLabel(taskId);
  if (!label) return null;
  return <span className="truncate text-fg-muted">· {label}</span>;
}
