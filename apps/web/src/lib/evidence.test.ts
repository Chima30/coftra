import { describe, expect, it } from "vitest";
import { CONTRACTS, SCENARIOS } from "./evidence";
import { MOVEMENTS, REPLAY } from "./evidence-replay";
import { deployment } from "./contracts/generated";

const HASH = /^0x[0-9a-f]{64}$/;
const BASE = 84532;
const LASNA = 5318007;

describe("recorded evidence", () => {
  it("has the four verified workflows, each with origin → reactive → callback", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(["checkpoint", "project-closeout", "session-closeout", "fallback"]);
    for (const s of SCENARIOS) {
      expect(s.hops).toHaveLength(3);
      for (const h of s.hops) expect(h.hash).toMatch(HASH);
      expect(s.hops[1].chainId, `${s.id} reactive hop runs on Lasna`).toBe(LASNA);
      expect(s.hops[2].chainId, `${s.id} callback lands on Base Sepolia`).toBe(BASE);
    }
    expect(SCENARIOS.find((s) => s.id === "fallback")!.hops[0].chainId, "FALLBACK origin is a Lasna cron tick").toBe(LASNA);
  });

  it("never reuses a transaction hash across different hops", () => {
    const all = SCENARIOS.flatMap((s) => s.hops.map((h) => h.hash));
    expect(new Set(all).size).toBe(all.length);
  });

  it("lists the deployed addresses from the deployment record", () => {
    const byName = Object.fromEntries(CONTRACTS.map((c) => [c.name.split(" ")[0], c.address.toLowerCase()]));
    expect(byName.CoftraVault).toBe(deployment!.vault!.toLowerCase());
    expect(byName.CoftraReactive).toBe(deployment!.reactive!.toLowerCase());
    expect(byName.CoftraMilestoneVerifier).toBe(deployment!.verifierRegistry.toLowerCase());
  });
});

describe("replay data", () => {
  it("has before + three after-states with aligned rows for every workflow", () => {
    for (const s of SCENARIOS) {
      const states = REPLAY[s.id];
      expect(states, s.id).toHaveLength(4);
      const labels = states[0].map((r) => r.label);
      for (const st of states) expect(st.map((r) => r.label), s.id).toEqual(labels);
    }
  });

  it("changes no balances at the reactive step (it only requests a callback)", () => {
    for (const s of SCENARIOS) {
      const [, afterOrigin, afterReactive] = REPLAY[s.id];
      expect(afterReactive, s.id).toEqual(afterOrigin);
    }
  });

  it("ends the closing workflows with nothing left in the vault, and CHECKPOINT with the rest still held", () => {
    for (const id of ["project-closeout", "session-closeout", "fallback"]) {
      expect(REPLAY[id][3].find((r) => r.label === "Held in vault")?.value, id).toBe("0 tUSDC");
    }
    // After checkpoint 1 the task stays open: 50 for checkpoint 2 plus the 20 reserve.
    expect(REPLAY.checkpoint[3].find((r) => r.label === "Held in vault")?.value).toBe("70 tUSDC");
  });
});

describe("receipt movements", () => {
  it("only cite transactions that belong to the same workflow", () => {
    for (const s of SCENARIOS) {
      const own = new Set(s.hops.map((h) => h.hash));
      for (const m of MOVEMENTS[s.id]) expect(own.has(m.tx), `${s.id}: ${m.what}`).toBe(true);
    }
  });
});
