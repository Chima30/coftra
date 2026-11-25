"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { removeContact, saveContact, useContacts } from "@/lib/contacts";
import { destination } from "@/lib/chains";
import { Hex } from "./hex";
import { Button, Card, CardHeader, Field, Input } from "./ui/primitives";

/** Private address book: names shown instead of 0x… across the app, kept only in this browser. */
export function ContactsCard() {
  const contacts = useContacts();
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const entries = Object.entries(contacts).sort((a, b) => a[1].localeCompare(b[1]));

  function add(e: React.FormEvent) {
    e.preventDefault();
    const err = saveContact(address, name);
    setError(err);
    if (!err) {
      setAddress("");
      setName("");
    }
  }

  return (
    <Card id="contacts">
      <CardHeader
        title="Contacts"
        description="Name the people you pay, verify with or let spend, and Coftra shows the name next to their address. Kept only in this browser; shared links never include them."
      />
      <form onSubmit={add} className="grid gap-3 border-b border-border p-5 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <Field label="Address" htmlFor="contact-address" error={error}>
          <Input id="contact-address" placeholder="0x…" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Name" htmlFor="contact-name">
          <Input id="contact-name" placeholder="Ada" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" variant="secondary">Save</Button>
      </form>
      {entries.length === 0 ? (
        <p className="px-5 py-4 text-sm text-fg-muted">No contacts yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map(([a, n]) => (
            <li key={a} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{n}</div>
                <Hex value={a} chainId={destination.id} plain />
              </div>
              <button
                type="button"
                aria-label={`Remove ${n}`}
                className="rounded p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-danger"
                onClick={() => removeContact(a)}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
