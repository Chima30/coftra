// Independently re-verifies the four recorded Reactive loops from raw chain data.
// Read-only: it fetches receipts and contract state and checks them against explicit expectations.
// Usage (from apps/web): pnpm verify:proofs      Exit code 1 if any check fails.
import { createPublicClient, http, parseAbi, parseEventLogs, getAddress, toHex } from "viem";
import { baseSepolia } from "viem/chains";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dep = JSON.parse(readFileSync(join(here, "..", "..", "..", "contracts", "deployments", "base-sepolia.json"), "utf8"));

const base = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia-rpc.publicnode.com") });
const lasna = createPublicClient({ transport: http(process.env.LASNA_RPC_URL || "https://lasna-rpc.rnk.dev/") });

const OWNER = getAddress("0x67b55ebde94ad5f3e25a8f78fb0ece4a971d575f");
const RECIPIENT = getAddress("0x1aB08630eFd349E28e9928694dA7018B002C5280");
const BOT = getAddress("0x84BF8c5143Ba3937D8FD12Fd24788A67Eb55e264");
const CRON_EMITTER = "0x0000000000000000000000000000000000ffffff";
const CRON100_T0 = "0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70";

const abi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event MilestoneVerified(uint256 indexed taskId, uint256 indexed milestoneIndex, address indexed verifier, uint64 configVersion)",
  "event MilestoneReleased(uint256 indexed taskId, uint256 indexed milestoneIndex, address recipient, uint256 amount, bool viaReactive)",
  "event ReactiveCallbackHandled(uint256 indexed taskId, uint8 indexed kind, uint256 indexed originTxHash, uint256 originChainId, uint8 result)",
  "event TaskClosed(uint256 indexed taskId, uint8 finalState)",
  "event ExecutorRevoked(uint256 indexed taskId, address indexed executor)",
  "event SessionExecuted(uint256 indexed taskId, address indexed target, uint256 spent, uint32 executions)",
  "event CallbackRequested(uint8 indexed kind, uint256 indexed subject, uint256 indexed originTxHash, uint256 originChainId)",
  "function ownerOf(uint256) view returns (address)",
  "function getTask(uint256) view returns ((address owner,uint8 kind,uint8 state,uint8 milestoneCount,uint8 milestonesDone,uint64 deadline,uint64 configVersion,uint64 createdAt,uint64 closedAt,address token,address recipient,address refundTo,uint256 deposited,uint256 released,uint256 refunded))",
  "function getSession(uint256) view returns ((address executor,address target,bytes4 selector,address beneficiary,uint256 spendCap,uint256 spent,uint32 executions,bool executorActive))",
]);

// ERC-721 Transfer indexes tokenId (4 topics), so it needs its own definition.
const nftAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"]);

const eq = (a, b) => a.toLowerCase() === b.toLowerCase();
let failures = 0;
function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function originAndReactive(name, originClient, originHash, reactiveHash, kind, subject) {
  const o = await originClient.getTransactionReceipt({ hash: originHash });
  check(`${name}: origin tx succeeded`, o.status === "success");
  const r = await lasna.getTransactionReceipt({ hash: reactiveHash });
  check(`${name}: reactive tx succeeded on Lasna`, r.status === "success");
  const req = parseEventLogs({ abi, logs: r.logs, eventName: "CallbackRequested" }).filter((l) => eq(l.address, dep.reactive));
  const match = req.find((l) => l.args.kind === kind && l.args.subject === subject && toHex(l.args.originTxHash, { size: 32 }) === originHash);
  check(`${name}: CoftraReactive requested the callback for this origin`, !!match, `kind ${kind}, subject ${subject}`);
  return o;
}

async function callback(name, hash, { taskId, kind, originHash, originChainId }) {
  const c = await base.getTransactionReceipt({ hash });
  check(`${name}: callback tx succeeded on Base Sepolia`, c.status === "success");
  check(`${name}: delivered through the Reactive callback proxy`, eq(c.to, dep.callbackProxy), c.to);
  const h = parseEventLogs({ abi, logs: c.logs, eventName: "ReactiveCallbackHandled" }).find((l) => eq(l.address, dep.vault) && l.args.taskId === taskId);
  check(`${name}: vault recorded ReactiveCallbackHandled for task ${taskId}`, !!h);
  if (h) {
    check(`${name}: callback kind`, h.args.kind === kind, String(h.args.kind));
    check(`${name}: callback names the right origin tx`, toHex(h.args.originTxHash, { size: 32 }) === originHash);
    check(`${name}: origin chain id`, h.args.originChainId === BigInt(originChainId), String(h.args.originChainId));
    check(`${name}: result Applied`, h.args.result === 0, String(h.args.result));
  }
  return c;
}

function transfers(receipt) {
  return parseEventLogs({ abi, logs: receipt.logs, eventName: "Transfer" }).filter((l) => eq(l.address, dep.token));
}
const hasTransfer = (receipt, from, to, value) => transfers(receipt).some((t) => eq(t.args.from, from) && eq(t.args.to, to) && t.args.value === value);

async function main() {
  console.log("CHECKPOINT (task 1, checkpoint 1)");
  {
    const origin = "0xd14aab0c1ba0d840139b1b6e0d97491e464581b0c3435ff5995876037f4560ce";
    const o = await originAndReactive("CHECKPOINT", base, origin, "0xf584e835f25d1fd4e5d3d24c44ef8169248fd2245d676eff0427e94c1d13682c", 0, 1n);
    const mv = parseEventLogs({ abi, logs: o.logs, eventName: "MilestoneVerified" }).find((l) => eq(l.address, dep.verifierRegistry));
    check("CHECKPOINT: MilestoneVerified emitted by the verifier registry", !!mv && mv.args.taskId === 1n && mv.args.milestoneIndex === 0n);
    const c = await callback("CHECKPOINT", "0x6c2d47492b3a67cfae829059840563e11816097fc562b3c14374a36109b42868", { taskId: 1n, kind: 0, originHash: origin, originChainId: 84532 });
    check("CHECKPOINT: 30 tUSDC vault -> recipient", hasTransfer(c, dep.vault, RECIPIENT, 30_000_000n));
    const rel = parseEventLogs({ abi, logs: c.logs, eventName: "MilestoneReleased" })[0];
    check("CHECKPOINT: MilestoneReleased(viaReactive = true)", !!rel && rel.args.viaReactive === true && rel.args.milestoneIndex === 0n);
  }

  console.log("CLOSEOUT, project (task 1, final checkpoint)");
  {
    const origin = "0x4330a5abe5a213614a0213510f666475028cbce361e499a3013ef53aed7d4846";
    const o = await originAndReactive("PROJECT CLOSEOUT", base, origin, "0xae198bcdaae3c6b8e992f5607413cf0adb83a17081557987a84a6e7153552311", 0, 1n);
    const mv = parseEventLogs({ abi, logs: o.logs, eventName: "MilestoneVerified" }).find((l) => eq(l.address, dep.verifierRegistry));
    check("PROJECT CLOSEOUT: MilestoneVerified(task 1, checkpoint 2)", !!mv && mv.args.taskId === 1n && mv.args.milestoneIndex === 1n);
    const c = await callback("PROJECT CLOSEOUT", "0xe917b2f438bdf9ebac2bf2a63cb85df473093a1fabe0d0c8a1217c29a28bc9ed", { taskId: 1n, kind: 0, originHash: origin, originChainId: 84532 });
    check("PROJECT CLOSEOUT: 50 tUSDC vault -> recipient", hasTransfer(c, dep.vault, RECIPIENT, 50_000_000n));
    check("PROJECT CLOSEOUT: 20 tUSDC reserve vault -> owner", hasTransfer(c, dep.vault, OWNER, 20_000_000n));
    const closed = parseEventLogs({ abi, logs: c.logs, eventName: "TaskClosed" }).find((l) => l.args.taskId === 1n);
    check("PROJECT CLOSEOUT: TaskClosed(1, Completed)", closed?.args.finalState === 3);
    const t = await base.readContract({ address: dep.vault, abi, functionName: "getTask", args: [1n] });
    check("PROJECT CLOSEOUT: task 1 now Completed, 80 released, 20 refunded", t.state === 3 && t.released === 80_000_000n && t.refunded === 20_000_000n);
  }

  console.log("CLOSEOUT, session (task 3)");
  {
    const origin = "0x0cb519ee7ed7a9894a790ce0a8c2cd34ac8e6fc6f738ba13d453173e0503f99f";
    const o = await originAndReactive("SESSION CLOSEOUT", base, origin, "0x1c03e0d5b22b94df6008bd788f3988b71c84f4ff156418e3702304030c8deba4", 1, 1n);
    check("SESSION CLOSEOUT: sent by the bot executor", eq(o.from, BOT), o.from);
    const mint = parseEventLogs({ abi: nftAbi, logs: o.logs, eventName: "Transfer" }).find(
      (l) => eq(l.address, dep.demoNft) && eq(l.args.from, "0x0000000000000000000000000000000000000000"),
    );
    check("SESSION CLOSEOUT: demo NFT minted token 1 to the owner", !!mint && eq(mint.args.to, OWNER) && mint.args.tokenId === 1n);
    const exec = parseEventLogs({ abi, logs: o.logs, eventName: "SessionExecuted" })[0];
    check("SESSION CLOSEOUT: vault recorded the session spend of 25 tUSDC", exec?.args.spent === 25_000_000n);
    const c = await callback("SESSION CLOSEOUT", "0xd26d202b13f207173a73fff75a96c149370c5e12c89dee186add4eeb24b9c5fa", { taskId: 3n, kind: 1, originHash: origin, originChainId: 84532 });
    check("SESSION CLOSEOUT: ExecutorRevoked(bot)", parseEventLogs({ abi, logs: c.logs, eventName: "ExecutorRevoked" }).some((l) => eq(l.args.executor, BOT)));
    check("SESSION CLOSEOUT: 15 tUSDC unspent vault -> owner", hasTransfer(c, dep.vault, OWNER, 15_000_000n));
    const s = await base.readContract({ address: dep.vault, abi, functionName: "getSession", args: [3n] });
    check("SESSION CLOSEOUT: executor still inactive, spent 25 of 25", s.executorActive === false && s.spent === 25_000_000n && s.spendCap === 25_000_000n);
    const nftOwner = await base.readContract({ address: dep.demoNft, abi, functionName: "ownerOf", args: [1n] });
    check("SESSION CLOSEOUT: NFT #1 currently owned by the owner", eq(nftOwner, OWNER), nftOwner);
  }

  console.log("FALLBACK (task 2)");
  {
    const origin = "0x612b3e7c48e85f5ea33681fce1c6e8afb6555290929733a1423b909208a2b5e6";
    const o = await originAndReactive("FALLBACK", lasna, origin, "0x5c48cda6f98fd703c6b0562dca07def027df9be65f035826c70f8e59cb25fb49", 2, 2n);
    check("FALLBACK: origin is a Cron100 tick from the system cron emitter", o.logs.some((l) => eq(l.address, CRON_EMITTER) && l.topics[0] === CRON100_T0));
    const c = await callback("FALLBACK", "0x00f052cdfd2f5f5e6eab4338610b1bef9702ef8ef8f833b57d85467761a0bf21", { taskId: 2n, kind: 2, originHash: origin, originChainId: 5318007 });
    check("FALLBACK: 20 tUSDC vault -> owner", hasTransfer(c, dep.vault, OWNER, 20_000_000n));
    const closed = parseEventLogs({ abi, logs: c.logs, eventName: "TaskClosed" }).find((l) => l.args.taskId === 2n);
    check("FALLBACK: TaskClosed(2, Expired)", closed?.args.finalState === 4);
    const t = await base.readContract({ address: dep.vault, abi, functionName: "getTask", args: [2n] });
    const block = await base.getBlock({ blockNumber: c.blockNumber });
    check("FALLBACK: callback executed after the task deadline", block.timestamp >= t.deadline, `${block.timestamp - t.deadline}s after`);
    check("FALLBACK: task 2 Expired, nothing released, 20 refunded", t.state === 4 && t.released === 0n && t.refunded === 20_000_000n);
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}


main().catch((e) => {
  console.error("Could not complete verification:", e.shortMessage ?? e.message);
  process.exit(2);
});
