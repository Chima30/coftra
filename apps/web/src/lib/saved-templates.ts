"use client";

import { useSyncExternalStore } from "react";
import { formatUnits, isAddress } from "viem";
import { TOKEN_DECIMALS } from "./contracts";
import { fmtToken, parseToken, shortHex } from "./format";
import { TaskKind } from "./protocol";

/**
 * Saved rules you can start a new task from in one click. Like contacts and task names, they live only in
 * this browser: nothing is sent anywhere, and a template is just a pre-filled form. Every value is still
 * shown, validated and inspected in the Rule Builder before anything is signed.
 */
const KEY = "coftra.templates.v1";
const EVENT = "coftra-templates";
export const MAX_TEMPLATES = 30;
const MIN_DURATION = 15 * 60; // a template never starts a task with less than 15 minutes to go
const MAX_DURATION = 365 * 86400;

type Base = { id: string; name: string; budget: string; refundTo: string; durationSec: number; savedAt: number };
export type SavedTemplate =
  | (Base & { kind: TaskKind.ProjectBudget; recipient: string; milestones: { amount: string; verifier: string }[] })
  | (Base & { kind: TaskKind.SpendingSession; executor: string; cap: string });

export type NewTemplate =
  | Omit<Extract<SavedTemplate, { kind: TaskKind.ProjectBudget }>, "id" | "savedAt">
  | Omit<Extract<SavedTemplate, { kind: TaskKind.SpendingSession }>, "id" | "savedAt">;

const isAmount = (v: unknown): v is string => typeof v === "string" && parseToken(v) !== null;
const isAddr = (v: unknown): v is string => typeof v === "string" && isAddress(v, { strict: false });
const clampDuration = (s: number) => Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(s)));

/** Validate one stored or new template. Anything malformed is dropped rather than half-loaded. */
export function cleanTemplate(x: unknown): NewTemplate | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  if (!name || !isAmount(o.budget) || !isAddr(o.refundTo) || typeof o.durationSec !== "number" || !Number.isFinite(o.durationSec)) return null;
  const base = { name, budget: o.budget.trim(), refundTo: o.refundTo, durationSec: clampDuration(o.durationSec) };
  if (o.kind === TaskKind.ProjectBudget) {
    if (!isAddr(o.recipient) || !Array.isArray(o.milestones) || o.milestones.length < 1 || o.milestones.length > 10) return null;
    const milestones = o.milestones.map((m) => (m && typeof m === "object" ? (m as Record<string, unknown>) : {}));
    if (!milestones.every((m) => isAmount(m.amount) && isAddr(m.verifier))) return null;
    return {
      ...base,
      kind: TaskKind.ProjectBudget,
      recipient: o.recipient,
      milestones: milestones.map((m) => ({ amount: (m.amount as string).trim(), verifier: m.verifier as string })),
    };
  }
  if (o.kind === TaskKind.SpendingSession) {
    if (!isAddr(o.executor) || !isAmount(o.cap)) return null;
    return { ...base, kind: TaskKind.SpendingSession, executor: o.executor, cap: o.cap.trim() };
  }
  return null;
}

export function parseTemplates(raw: string | null): SavedTemplate[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: SavedTemplate[] = [];
    for (const x of arr) {
      const t = cleanTemplate(x);
      const o = x as Record<string, unknown>;
      if (t && typeof o.id === "string" && o.id) out.push({ ...t, id: o.id, savedAt: typeof o.savedAt === "number" ? o.savedAt : 0 } as SavedTemplate);
    }
    return out.slice(0, MAX_TEMPLATES);
  } catch {
    return [];
  }
}

/** The minimum a task view needs to become a template (see lib/reads.ts). */
type TaskLikeForTemplate = {
  id: bigint;
  task: { kind: number; deadline: bigint; createdAt: bigint; recipient: string; refundTo: string; deposited: bigint };
  milestones: readonly { amount: bigint; verifier: string }[];
  session: { executor: string; spendCap: bigint };
};

const units = (v: bigint) => formatUnits(v, TOKEN_DECIMALS);

/** A template that repeats an existing task: same amounts, people and deadline length. */
export function templateFromTask(t: TaskLikeForTemplate, name: string): NewTemplate | null {
  const base = {
    name,
    budget: units(t.task.deposited),
    refundTo: t.task.refundTo,
    durationSec: Number(t.task.deadline - t.task.createdAt),
  };
  return cleanTemplate(
    t.task.kind === TaskKind.ProjectBudget
      ? { ...base, kind: TaskKind.ProjectBudget, recipient: t.task.recipient, milestones: t.milestones.map((m) => ({ amount: units(m.amount), verifier: m.verifier })) }
      : { ...base, kind: TaskKind.SpendingSession, executor: t.session.executor, cap: units(t.session.spendCap) },
  );
}

export function fmtDuration(sec: number) {
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  if (sec < 2 * 86400) {
    const h = sec / 3600;
    return `${Number.isInteger(h) ? h : h.toFixed(1)} hour${h === 1 ? "" : "s"}`;
  }
  return `${Math.round(sec / 86400)} days`;
}

/** One line that says what a template will set up, e.g. "100 tUSDC · 2 checkpoints · to Ada · 1 hour". */
export function describeTemplate(t: NewTemplate, name: (a: string) => string = (a) => shortHex(a)) {
  const amount = fmtToken(parseToken(t.budget) ?? 0n);
  const parts =
    t.kind === TaskKind.ProjectBudget
      ? [amount, `${t.milestones.length} checkpoint${t.milestones.length === 1 ? "" : "s"}`, `to ${name(t.recipient)}`]
      : [amount, `${name(t.executor)} may spend ${fmtToken(parseToken(t.cap) ?? 0n)}`];
  return [...parts, `${fmtDuration(t.durationSec)} deadline`].join(" · ");
}

// useSyncExternalStore needs a stable snapshot: cache the parsed list per raw string.
let lastRaw: string | null | undefined;
let lastParsed: SavedTemplate[] = [];
const EMPTY: SavedTemplate[] = [];

function snapshot(): SavedTemplate[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage unavailable */
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastParsed = parseTemplates(raw);
  }
  return lastParsed;
}

function write(list: SavedTemplate[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Save a template. Returns its id, or an error message. */
export function saveTemplate(t: NewTemplate): { id: string } | { error: string } {
  const clean = cleanTemplate(t);
  if (!clean) return { error: "Some values in this rule aren't valid, so it can't be saved." };
  const list = snapshot();
  if (list.length >= MAX_TEMPLATES) return { error: `You already have ${MAX_TEMPLATES} templates. Remove one first.` };
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const saved = { ...clean, id, savedAt: Math.floor(Date.now() / 1000) } as SavedTemplate;
  return write([saved, ...list]) ? { id } : { error: "This browser isn't letting Coftra store anything (private window or blocked storage)." };
}

export function removeTemplate(id: string) {
  write(snapshot().filter((t) => t.id !== id));
}

/** Read one template outside React (the Rule Builder's first render). */
export function findTemplate(id: string | null): SavedTemplate | undefined {
  return id ? snapshot().find((t) => t.id === id) : undefined;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useSavedTemplates(): SavedTemplate[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
