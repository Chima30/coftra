"use client";

import { useSyncExternalStore } from "react";
import { isAddress } from "viem";

/**
 * Private address book. Names live only in this browser, like task labels: the chain never sees them,
 * shared links never carry them, and every screen still shows the real address next to the name.
 */
const KEY = "coftra.contacts.v1";
const EVENT = "coftra-contacts";
export const MAX_NAME = 40;

export type Contacts = Record<string, string>; // lowercase address -> name

/** Validate and normalise one entry. Returns an error message or the clean pair. */
export function cleanContact(address: string, name: string): { error: string } | { address: string; name: string } {
  const a = address.trim();
  const n = name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
  if (!isAddress(a, { strict: false })) return { error: "That isn't a valid 0x address." };
  if (!n) return { error: "Give the contact a name." };
  return { address: a.toLowerCase(), name: n };
}

/** Parse stored JSON defensively: drop anything that isn't an address -> non-empty string pair. */
export function parseContacts(raw: string | null): Contacts {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return {};
    const out: Contacts = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== "string") continue;
      const c = cleanContact(k, v);
      if ("address" in c) out[c.address] = c.name;
    }
    return out;
  } catch {
    return {};
  }
}

export function nameOf(contacts: Contacts, address?: string): string | undefined {
  return address ? contacts[address.toLowerCase()] : undefined;
}

// useSyncExternalStore needs a stable snapshot: cache the parsed object per raw string.
let lastRaw: string | null | undefined;
let lastParsed: Contacts = {};
const EMPTY: Contacts = {};

function snapshot(): Contacts {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage unavailable */
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastParsed = parseContacts(raw);
  }
  return lastParsed;
}

function write(next: Contacts) {
  try {
    if (Object.keys(next).length) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage unavailable: the contact simply isn't kept */
  }
}

export function saveContact(address: string, name: string) {
  const c = cleanContact(address, name);
  if ("error" in c) return c.error;
  write({ ...snapshot(), [c.address]: c.name });
  return null;
}

export function removeContact(address: string) {
  const next = { ...snapshot() };
  delete next[address.toLowerCase()];
  write(next);
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useContacts(): Contacts {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

export function useContactName(address?: string) {
  const contacts = useContacts();
  return nameOf(contacts, address);
}
