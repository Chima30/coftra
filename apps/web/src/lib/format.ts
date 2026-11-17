import { formatUnits, parseUnits } from "viem";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { TOKEN_DECIMALS, TOKEN_SYMBOL } from "./contracts";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtToken(v: bigint | undefined, withSymbol = true) {
  if (v === undefined) return "—";
  const n = Number(formatUnits(v, TOKEN_DECIMALS));
  const s = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return withSymbol ? `${s} ${TOKEN_SYMBOL}` : s;
}

export function parseToken(input: string): bigint | null {
  try {
    if (!input.trim()) return null;
    const v = parseUnits(input.trim(), TOKEN_DECIMALS);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

export function fmtNative(v: bigint | undefined, symbol: string, digits = 5) {
  if (v === undefined) return "—";
  return `${Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: digits })} ${symbol}`;
}

export function shortHex(h?: string, n = 4) {
  if (!h) return "—";
  return `${h.slice(0, 2 + n)}…${h.slice(-n)}`;
}

export function fmtDate(ts: number | bigint) {
  return new Date(Number(ts) * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function relTime(ts: number | bigint, now = Date.now() / 1000) {
  const d = Number(ts) - now;
  const abs = Math.abs(d);
  const unit =
    abs < 90 ? `${Math.round(abs)}s` : abs < 5400 ? `${Math.round(abs / 60)}m` : abs < 172800 ? `${Math.round(abs / 3600)}h` : `${Math.round(abs / 86400)}d`;
  return d >= 0 ? `in ${unit}` : `${unit} ago`;
}

/** uint256 txHash from a LogRecord, as stored in vault events, back to 0x-prefixed bytes32. */
export function uintToHash(v: bigint): `0x${string}` {
  return `0x${v.toString(16).padStart(64, "0")}`;
}
