/**
 * Recorded on-chain evidence for the four Reactive loops run on 2026-11-17 (Base Sepolia + Reactive Lasna).
 * Every hash below was confirmed with receipts on both chains, Reactive MCP traces and the vault's
 * ReactiveCallbackHandled event; see docs/IMPLEMENTATION_STATUS.md. Nothing here is simulated. The /proof
 * page re-checks each receipt live and says so when it cannot.
 */
import { baseSepolia } from "viem/chains";
import { lasna } from "./chains";

export const LINKS = {
  github: "https://github.com/Chima30/coftra",
  judgeQuickstart: "https://github.com/Chima30/coftra/blob/main/docs/JUDGE_QUICKSTART.md",
  status: "https://github.com/Chima30/coftra/blob/main/docs/IMPLEMENTATION_STATUS.md",
  architecture: "https://github.com/Chima30/coftra/blob/main/docs/architecture/ARCHITECTURE.md",
  security: "https://github.com/Chima30/coftra/blob/main/docs/security/SECURITY_REVIEW.md",
  vaultSource: "https://github.com/Chima30/coftra/blob/main/contracts/src/CoftraVault.sol",
  reactiveSource: "https://github.com/Chima30/coftra/blob/main/contracts/src/CoftraReactive.sol",
  reactiveDocs: "https://dev.reactive.network/",
} as const;

export type Hop = {
  label: string;
  chainId: number;
  hash: `0x${string}`;
  detail: string;
};

export type Scenario = {
  /** Seconds from origin block to callback block, measured from block timestamps (1 s resolution). */
  latencySeconds: number;
  id: string;
  engine: "CHECKPOINT" | "CLOSEOUT" | "FALLBACK";
  title: string;
  taskId: number;
  summary: string;
  config: string[];
  setup?: { label: string; hash: `0x${string}` }[];
  hops: [Hop, Hop, Hop];
  outcome: string[];
  caveat?: string;
  /** What started the loop, in plain words. */
  trigger: string;
  /** The task's state after the callback, as the vault recorded it. */
  finalState: string;
  /** Which of the deployed contracts took part (names from CONTRACTS below). */
  contracts: string[];
};

const BASE = baseSepolia.id;
const LASNA = lasna.id;

export const SCENARIOS: Scenario[] = [
  {
    id: "checkpoint",
    latencySeconds: 2,
    engine: "CHECKPOINT",
    title: "Verified milestone pays out automatically",
    taskId: 1,
    summary: "The named verifier attests checkpoint 1. Reactive relays it, and the vault pays exactly that checkpoint once.",
    config: [
      "Conditional Project Budget, 100 tUSDC deposited",
      "Checkpoint 1: 30 tUSDC · Checkpoint 2: 50 tUSDC · 20 tUSDC reserve never payable to the recipient",
      "Recipient 0x1aB0…5280 (throwaway address), deadline 1 day",
    ],
    setup: [{ label: "Task created and activated", hash: "0xf4edc766a4e8dc24cc31201e52d05c8322fd5132e61be9434380c84094f0301a" }],
    hops: [
      {
        label: "Origin: verifier attests checkpoint 1",
        chainId: BASE,
        hash: "0xd14aab0c1ba0d840139b1b6e0d97491e464581b0c3435ff5995876037f4560ce",
        detail: "MilestoneVerified(task 1, checkpoint 0) emitted by the verifier registry",
      },
      {
        label: "Reactive: react() requests a callback",
        chainId: LASNA,
        hash: "0xf584e835f25d1fd4e5d3d24c44ef8169248fd2245d676eff0427e94c1d13682c",
        detail: "CoftraReactive matched the registry event and requested onMilestoneVerified",
      },
      {
        label: "Callback: vault re-checks and pays",
        chainId: BASE,
        hash: "0x6c2d47492b3a67cfae829059840563e11816097fc562b3c14374a36109b42868",
        detail: "ReactiveCallbackHandled(Applied), MilestoneReleased(viaReactive = true)",
      },
    ],
    outcome: ["30 tUSDC transferred from the vault to the recipient", "Checkpoint 1 can never be paid again"],
    trigger: "The named verifier attested checkpoint 1 on Base Sepolia",
    finalState: "Task 1 Active · checkpoint 1 paid, checkpoint 2 pending",
    contracts: ["CoftraMilestoneVerifier", "CoftraReactive", "CoftraVault"],
    caveat: "For the demo the task owner also acted as verifier. In normal use the verifier is a separate party you trust to judge the work.",
  },
  {
    id: "project-closeout",
    latencySeconds: 1,
    engine: "CLOSEOUT",
    title: "Last milestone closes the project and returns the reserve",
    taskId: 1,
    summary: "Attesting the final checkpoint completes the task. The vault pays it, closes the task and returns the unused reserve in the same callback.",
    config: ["Same task 1, checkpoint 2 (50 tUSDC) still pending", "20 tUSDC reserve held in the vault"],
    hops: [
      {
        label: "Origin: verifier attests the final checkpoint",
        chainId: BASE,
        hash: "0x4330a5abe5a213614a0213510f666475028cbce361e499a3013ef53aed7d4846",
        detail: "MilestoneVerified(task 1, checkpoint 1)",
      },
      {
        label: "Reactive: react() requests a callback",
        chainId: LASNA,
        hash: "0xae198bcdaae3c6b8e992f5607413cf0adb83a17081557987a84a6e7153552311",
        detail: "Requested onMilestoneVerified for the last checkpoint",
      },
      {
        label: "Callback: pay, complete, refund",
        chainId: BASE,
        hash: "0xe917b2f438bdf9ebac2bf2a63cb85df473093a1fabe0d0c8a1217c29a28bc9ed",
        detail: "MilestoneReleased, Settled(Completed), TaskClosed",
      },
    ],
    outcome: [
      "50 tUSDC to the recipient (80 in total)",
      "Task 1 Completed; 20 tUSDC reserve returned to the owner",
      "The reactive contract saw TaskClosed and switched its cron off",
    ],
    trigger: "The named verifier attested the last checkpoint on Base Sepolia",
    finalState: "Task 1 Completed · 80 paid, 20 returned",
    contracts: ["CoftraMilestoneVerifier", "CoftraReactive", "CoftraVault"],
  },
  {
    id: "session-closeout",
    latencySeconds: 2,
    engine: "CLOSEOUT",
    title: "A bot's one-off spending permission ends by itself",
    taskId: 3,
    summary: "A bot may spend a capped amount on one action: minting an NFT to the owner. When the mint is observed, the session closes and the bot loses access.",
    config: [
      "Temporary Spending Session, 40 tUSDC deposited",
      "Executor (bot) 0x84BF…e264 may spend at most 25 tUSDC",
      "Only CoftraDemoNFT.mint(owner): the NFT can only go to the owner",
    ],
    setup: [{ label: "Session created (exact 40 tUSDC approval, then create)", hash: "0x90bd30285fc73e670e30ecb53f6830a3113cda6bbbc40651ec9ae5ee96b31271" }],
    hops: [
      {
        label: "Origin: bot pays and the NFT is minted to the owner",
        chainId: BASE,
        hash: "0x0cb519ee7ed7a9894a790ce0a8c2cd34ac8e6fc6f738ba13d453173e0503f99f",
        detail: "executeSession → CoftraDemoNFT Transfer(0x0 → owner, token 1)",
      },
      {
        label: "Reactive: react() requests a callback",
        chainId: LASNA,
        hash: "0x1c03e0d5b22b94df6008bd788f3988b71c84f4ff156418e3702304030c8deba4",
        detail: "Mint-only filter matched; requested onOutcome",
      },
      {
        label: "Callback: close session, revoke, refund",
        chainId: BASE,
        hash: "0xd26d202b13f207173a73fff75a96c149370c5e12c89dee186add4eeb24b9c5fa",
        detail: "ReactiveCallbackHandled(Applied), ExecutorRevoked, Settled(Completed)",
      },
    ],
    outcome: [
      "Session Completed about 2 s after the mint; the bot's access was revoked",
      "The bot spent exactly 25 of 25; 15 tUSDC unspent returned to the owner",
      "NFT #1 is owned by the owner; a second spend by the bot reverts with WrongState(3) (checked with a read-only call)",
    ],
    trigger: "The bot's paid mint delivered NFT #1 to the owner on Base Sepolia",
    finalState: "Task 3 Completed · 25 spent, 15 returned, executor revoked",
    contracts: ["CoftraVault", "CoftraDemoNFT (test only)", "CoftraReactive"],
  },
  {
    id: "fallback",
    latencySeconds: 3,
    engine: "FALLBACK",
    title: "Missed deadline: the task expires and refunds itself",
    taskId: 2,
    summary: "Nobody attested the milestone. After the deadline, a Reactive Cron tick asked the vault to expire the task; the vault checked the deadline itself and refunded.",
    config: ["Conditional Project Budget, 20 tUSDC, one 10 tUSDC checkpoint", "Deadline about 3.5 minutes after creation; never attested"],
    setup: [{ label: "Task created and activated", hash: "0xfb747b64291794ac8b35b07a9bb0217be7e459a76f0eac50666a22719e174838" }],
    hops: [
      {
        label: "Origin: Reactive Cron tick (on Lasna)",
        chainId: LASNA,
        hash: "0x612b3e7c48e85f5ea33681fce1c6e8afb6555290929733a1423b909208a2b5e6",
        detail: "Cron event from 0x…fffFfF; no user transaction involved",
      },
      {
        label: "Reactive: react() finds the overdue task",
        chainId: LASNA,
        hash: "0x5c48cda6f98fd703c6b0562dca07def027df9be65f035826c70f8e59cb25fb49",
        detail: "Deadline index (built from vault events) → requested onExpiryCheck([2])",
      },
      {
        label: "Callback: vault confirms the deadline and expires",
        chainId: BASE,
        hash: "0x00f052cdfd2f5f5e6eab4338610b1bef9702ef8ef8f833b57d85467761a0bf21",
        detail: "ReactiveCallbackHandled(Applied), Settled(Expired), TaskClosed",
      },
    ],
    outcome: [
      "Task 2 Expired 77 s after its deadline (next Cron100 tick), with nobody online",
      "20 tUSDC returned to the owner",
      "A late attestation is now rejected by the registry (NotAttestable)",
    ],
    trigger: "A Reactive Cron tick on Lasna after the deadline (no user transaction)",
    finalState: "Task 2 Expired · nothing paid, 20 returned",
    contracts: ["CoftraReactive", "CoftraVault"],
  },
];

/** Every contract below is source-verified on Sourcify with exact_match (runtime and creation), 2026-11-25. */
export const sourcifyUrl = (chainId: number, address: string) => `https://repo.sourcify.dev/${chainId}/${address}`;

export const CONTRACTS: { name: string; chainId: number; address: `0x${string}`; source?: string }[] = [
  { name: "CoftraVault", chainId: BASE, address: "0x2335A6D769bb3f6E6D4B1a48f6926A81aEA5b719", source: LINKS.vaultSource },
  { name: "CoftraReactive", chainId: LASNA, address: "0x17B29bC8400FB88de4c885Af4335983cd09c3D96", source: LINKS.reactiveSource },
  { name: "CoftraMilestoneVerifier", chainId: BASE, address: "0x6AF465995710BA15db53D1a0F0867Ed4f38D3291" },
  { name: "CoftraMockUSDC (tUSDC, test only)", chainId: BASE, address: "0xa4da96908af4cd2cb4dAAde2359deB221B4F03D5" },
  { name: "CoftraDemoNFT (test only)", chainId: BASE, address: "0x08643a27E03AEef33daBb629091Cf15730b2d4FD" },
];

/** Observed on 2026-11-17 from receipts and balances; testnet values, not mainnet estimates. */
export const OBSERVED_COSTS = {
  vaultCallbackSpend: "0.002 → 0.0019954 ETH for the four callbacks (≈0.0000012 ETH each, Base Sepolia gas price 0.006 gwei)",
  callbackGas: "143,452–162,924 gas per callback",
  reactGas: "78,678–95,207 gas per react() on Lasna",
  reactionFee: "≈0.016–0.022 lREACT per reaction (Reactive MCP estimate with the live fee parameters)",
  cronDrain: "Measured from archive state: 0.415 lREACT over 52.9 min while Cron100 ran with open tasks (≈0.0079 lREACT per minute, ≈11 per day)",
} as const;
