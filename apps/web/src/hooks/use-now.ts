"use client";

import { useEffect, useState } from "react";

/**
 * Current unix time in seconds, refreshed on an interval. Returns 0 until mounted, so prerendered HTML never
 * bakes in a build-time clock and hydration matches. Callers treat 0 as "not known yet".
 */
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
