/**
 * Vault state before and after each hop of the four recorded loops, and the token movements they caused.
 * Every value is confirmed by `pnpm verify:proofs` (receipts, Transfer events and current contract state).
 * This is a replay of recorded activity; nothing here is live or simulated.
 */

export type StateRow = { label: string; value: string };
/** [before origin, after origin, after reactive tx, after callback] */
export type ReplayStates = [StateRow[], StateRow[], StateRow[], StateRow[]];

export type Movement = { what: string; from: string; to: string; tx: `0x${string}` };

const T1_CB = "0x6c2d47492b3a67cfae829059840563e11816097fc562b3c14374a36109b42868";
const T1_CLOSE = "0xe917b2f438bdf9ebac2bf2a63cb85df473093a1fabe0d0c8a1217c29a28bc9ed";
const T3_MINT = "0x0cb519ee7ed7a9894a790ce0a8c2cd34ac8e6fc6f738ba13d453173e0503f99f";
const T3_CB = "0xd26d202b13f207173a73fff75a96c149370c5e12c89dee186add4eeb24b9c5fa";
const T2_CB = "0x00f052cdfd2f5f5e6eab4338610b1bef9702ef8ef8f833b57d85467761a0bf21";

const same = (rows: StateRow[]) => rows.map((r) => ({ ...r }));

const checkpointBefore = [
  { label: "Task 1", value: "Active" },
  { label: "Held in vault", value: "100 tUSDC" },
  { label: "Checkpoint 1", value: "Waiting for verifier" },
  { label: "Recipient received", value: "0 tUSDC" },
];
const checkpointAttested = [
  { label: "Task 1", value: "Active" },
  { label: "Held in vault", value: "100 tUSDC" },
  { label: "Checkpoint 1", value: "Attested; not paid yet" },
  { label: "Recipient received", value: "0 tUSDC" },
];

const closeoutBefore = [
  { label: "Task 1", value: "Active" },
  { label: "Held in vault", value: "70 tUSDC (50 checkpoint + 20 reserve)" },
  { label: "Recipient received", value: "30 tUSDC" },
  { label: "Returned to owner", value: "0 tUSDC" },
];

const sessionBefore = [
  { label: "Task 3", value: "Active" },
  { label: "Held in vault", value: "40 tUSDC" },
  { label: "Bot access", value: "Can spend up to 25" },
  { label: "NFT #1", value: "Not minted" },
  { label: "Returned to owner", value: "0 tUSDC" },
];
const sessionAfterMint = [
  { label: "Task 3", value: "Active" },
  { label: "Held in vault", value: "15 tUSDC" },
  { label: "Bot access", value: "Spent 25 of 25" },
  { label: "NFT #1", value: "Owned by the owner" },
  { label: "Returned to owner", value: "0 tUSDC" },
];

const fallbackBefore = [
  { label: "Task 2", value: "Active, deadline passed" },
  { label: "Held in vault", value: "20 tUSDC" },
  { label: "Checkpoint 1", value: "Never attested" },
  { label: "Returned to owner", value: "0 tUSDC" },
];

export const REPLAY: Record<string, ReplayStates> = {
  checkpoint: [
    checkpointBefore,
    checkpointAttested,
    same(checkpointAttested),
    [
      { label: "Task 1", value: "Active" },
      { label: "Held in vault", value: "70 tUSDC" },
      { label: "Checkpoint 1", value: "Paid via Reactive" },
      { label: "Recipient received", value: "30 tUSDC" },
    ],
  ],
  "project-closeout": [
    closeoutBefore,
    same(closeoutBefore),
    same(closeoutBefore),
    [
      { label: "Task 1", value: "Completed" },
      { label: "Held in vault", value: "0 tUSDC" },
      { label: "Recipient received", value: "80 tUSDC" },
      { label: "Returned to owner", value: "20 tUSDC" },
    ],
  ],
  "session-closeout": [
    sessionBefore,
    sessionAfterMint,
    same(sessionAfterMint),
    [
      { label: "Task 3", value: "Completed" },
      { label: "Held in vault", value: "0 tUSDC" },
      { label: "Bot access", value: "Revoked" },
      { label: "NFT #1", value: "Owned by the owner" },
      { label: "Returned to owner", value: "15 tUSDC" },
    ],
  ],
  fallback: [
    fallbackBefore,
    same(fallbackBefore),
    same(fallbackBefore),
    [
      { label: "Task 2", value: "Expired" },
      { label: "Held in vault", value: "0 tUSDC" },
      { label: "Checkpoint 1", value: "Frozen, never paid" },
      { label: "Returned to owner", value: "20 tUSDC" },
    ],
  ],
};

export const MOVEMENTS: Record<string, Movement[]> = {
  checkpoint: [{ what: "30 tUSDC", from: "Vault", to: "Recipient 0x1aB0…5280", tx: T1_CB }],
  "project-closeout": [
    { what: "50 tUSDC", from: "Vault", to: "Recipient 0x1aB0…5280", tx: T1_CLOSE },
    { what: "20 tUSDC (unused reserve)", from: "Vault", to: "Owner 0x67B5…575f", tx: T1_CLOSE },
  ],
  "session-closeout": [
    { what: "25 tUSDC (NFT price)", from: "Vault, spent by the bot", to: "NFT treasury (the deployer, 0x67B5…575f)", tx: T3_MINT },
    { what: "NFT #1", from: "Minted", to: "Owner 0x67B5…575f", tx: T3_MINT },
    { what: "15 tUSDC (unspent)", from: "Vault", to: "Owner 0x67B5…575f", tx: T3_CB },
  ],
  fallback: [{ what: "20 tUSDC (whole deposit)", from: "Vault", to: "Owner 0x67B5…575f", tx: T2_CB }],
};
