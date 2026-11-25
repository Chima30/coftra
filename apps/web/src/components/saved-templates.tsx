"use client";

import Link from "next/link";
import { useState } from "react";
import { BookmarkPlus, Check, Trash2 } from "lucide-react";
import { nameOf, useContacts } from "@/lib/contacts";
import { shortHex } from "@/lib/format";
import { kindLabel } from "@/lib/protocol";
import { describeTemplate, removeTemplate, saveTemplate, useSavedTemplates, type NewTemplate, type SavedTemplate } from "@/lib/saved-templates";
import { Button, Card, CardHeader, Input, buttonStyles } from "./ui/primitives";

/**
 * Your saved templates. With `onUse` (inside the Rule Builder) a click fills the form in place;
 * without it (Templates page) each one links to the builder. Renders nothing when there are none.
 */
export function SavedTemplateList({ onUse }: { onUse?: (t: SavedTemplate) => void }) {
  const list = useSavedTemplates();
  const contacts = useContacts();
  const [confirming, setConfirming] = useState<string | null>(null);
  if (list.length === 0) return null;
  const name = (a: string) => nameOf(contacts, a) ?? shortHex(a);
  return (
    <Card>
      <CardHeader title="Your templates" description="Saved in this browser. Using one fills in the form; you still review every value before signing." />
      <ul className="divide-y divide-border">
        {list.map((t) => (
          <li key={t.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <div className="font-display text-xl leading-tight">{t.name}</div>
              <div className="mt-1 text-xs text-fg-muted">
                {kindLabel[t.kind]} · {describeTemplate(t, name)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {confirming === t.id ? (
                <>
                  <span className="text-xs text-fg-muted">Remove?</span>
                  <Button size="sm" variant="danger" onClick={() => (removeTemplate(t.id), setConfirming(null))}>
                    Remove
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    Keep
                  </Button>
                </>
              ) : (
                <>
                  {onUse ? (
                    <Button size="sm" onClick={() => onUse(t)}>
                      Use
                    </Button>
                  ) : (
                    <Link href={`/create?saved=${t.id}`} className={buttonStyles({ size: "sm" })}>
                      Use
                    </Link>
                  )}
                  <Button size="sm" variant="ghost" className="px-2.5" aria-label={`Remove template ${t.name}`} onClick={() => setConfirming(t.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** "Save as template": asks for a name inline, then confirms with a link to use it. */
export function SaveTemplateButton({ build, defaultName }: { build: (name: string) => NewTemplate | null; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  if (savedId)
    return (
      <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-success" role="status">
        <Check className="size-4" aria-hidden /> Saved as a template.
        <Link href={`/create?saved=${savedId}`} className="text-accent underline-offset-4 hover:underline">
          Start a task from it
        </Link>
      </p>
    );

  if (!open)
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setName(defaultName);
          setOpen(true);
        }}
      >
        <BookmarkPlus className="size-4" aria-hidden /> Save as template
      </Button>
    );

  return (
    <form
      className="flex w-full flex-wrap items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const t = build(name.trim() || defaultName);
        const r = t ? saveTemplate(t) : { error: "Some values in this rule aren't valid, so it can't be saved." };
        if ("error" in r) setError(r.error);
        else setSavedId(r.id);
      }}
    >
      <label htmlFor="template-name" className="sr-only">
        Template name
      </label>
      <Input id="template-name" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="h-9 min-w-0 flex-1 basis-48" />
      <Button type="submit" size="sm">
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => (setOpen(false), setError(null))}>
        Cancel
      </Button>
      {error && (
        <p className="w-full text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
