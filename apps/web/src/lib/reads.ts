import { type Log, parseAbiItem, type PublicClient } from "viem";
import { destinationClient, lasnaClient } from "./wagmi";
import { reactiveAbi, vaultAbi, type Address, type Deployment, CALLBACK_PROXY } from "./contracts";
import { SYSTEM_CONTRACT } from "./chains";

export type TaskView = Awaited<ReturnType<typeof readTask>>;

const payableAbi = [parseAbiItem("function debt(address) view returns (uint256)")] as const;
const reservesAbi = [parseAbiItem("function reserves(address) view returns (uint256)")] as const;

export async function readTaskIds(d: Deployment, account: Address) {
  const [owned, involved] = await destinationClient.multicall({
    allowFailure: false,
    contracts: [
      { address: d.vault, abi: vaultAbi, functionName: "tasksOf", args: [account] },
      { address: d.vault, abi: vaultAbi, functionName: "tasksInvolving", args: [account] },
    ],
  });
  const ids = Array.from(new Set([...owned, ...involved].map((x) => x.toString()))).map(BigInt);
  return { ids: ids.sort((a, b) => Number(b - a)), owned: new Set(owned.map(String)) };
}

export async function readTask(d: Deployment, id: bigint) {
  const [task, milestones, session, available, reserved] = await destinationClient.multicall({
    allowFailure: false,
    contracts: [
      { address: d.vault, abi: vaultAbi, functionName: "getTask", args: [id] },
      { address: d.vault, abi: vaultAbi, functionName: "getMilestones", args: [id] },
      { address: d.vault, abi: vaultAbi, functionName: "getSession", args: [id] },
      { address: d.vault, abi: vaultAbi, functionName: "availableBalance", args: [id] },
      { address: d.vault, abi: vaultAbi, functionName: "reservedBalance", args: [id] },
    ],
  });
  return { id, task, milestones, session, available, reserved };
}

export async function readTasks(d: Deployment, ids: bigint[]) {
  return Promise.all(ids.map((id) => readTask(d, id)));
}

/**
 * Fetch logs in ranges, halving the range when an RPC rejects it. Public RPC limits differ a lot:
 * sepolia.base.org allows only 200 blocks, publicnode allows 50,000+, Lasna allows 30,000.
 */
export async function getLogsChunked<T>(
  fetcher: (from: bigint, to: bigint) => Promise<T[]>,
  fromBlock: bigint,
  toBlock: bigint,
  initialSpan = 45_000n,
  concurrency = 4,
): Promise<T[]> {
  if (toBlock < fromBlock) return [];
  // Split the whole range up front and fetch a few ranges at a time. A range the RPC rejects is
  // split in half recursively, so one strict RPC limit never stalls the rest.
  const ranges: [bigint, bigint][] = [];
  for (let s = fromBlock; s <= toBlock; s += initialSpan) {
    ranges.push([s, s + initialSpan - 1n > toBlock ? toBlock : s + initialSpan - 1n]);
  }
  const fetchRange = async (from: bigint, to: bigint): Promise<T[]> => {
    try {
      return await fetcher(from, to);
    } catch (e) {
      if (to - from < 50n) throw e;
      const mid = from + (to - from) / 2n;
      const [a, b] = await Promise.all([fetchRange(from, mid), fetchRange(mid + 1n, to)]);
      return [...a, ...b];
    }
  };
  const results: T[][] = new Array(ranges.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, ranges.length) }, async () => {
      while (next < ranges.length) {
        const i = next++;
        results[i] = await fetchRange(ranges[i][0], ranges[i][1]);
      }
    }),
  );
  return results.flat(); // ranges stay in block order
}

/**
 * Base Sepolia produces a block every 200 ms (about 432,000 blocks per day), so ranges are large
 * (45,000 blocks ≈ 2.5 hours; publicnode accepts 50,000+).
 */
export async function readVaultLogs(d: Deployment) {
  const latest = await destinationClient.getBlockNumber();
  return getLogsChunked(
    (fromBlock, toBlock) => destinationClient.getContractEvents({ address: d.vault, abi: vaultAbi, fromBlock, toBlock }),
    d.fromBlock,
    latest,
  );
}

export type VaultLog = Awaited<ReturnType<typeof readVaultLogs>>[number];

/** CallbackRequested events emitted by CoftraReactive on Lasna, optionally for one origin tx. */
export async function readReactiveRequests(d: Deployment, opts: { originTxHash?: bigint; lookbackBlocks?: bigint } = {}) {
  const latest = await lasnaClient.getBlockNumber();
  const floor = BigInt(d.reactiveBlock ?? 0);
  const from = opts.lookbackBlocks && latest - opts.lookbackBlocks > floor ? latest - opts.lookbackBlocks : floor;
  return getLogsChunked(
    (fromBlock, toBlock) =>
      (lasnaClient as PublicClient).getContractEvents({
        address: d.reactive,
        abi: reactiveAbi,
        eventName: "CallbackRequested",
        args: opts.originTxHash !== undefined ? { originTxHash: opts.originTxHash } : undefined,
        fromBlock,
        toBlock,
      }),
    from,
    latest,
    25_000n, // Lasna caps eth_getLogs at 30,000 blocks
  );
}

export type ReactiveRequestLog = Awaited<ReturnType<typeof readReactiveRequests>>[number];

export async function readFundingHealth(d: Deployment) {
  const [vaultBalance, proxyDebt, destGasPrice] = await Promise.all([
    destinationClient.getBalance({ address: d.vault }),
    destinationClient.readContract({ address: CALLBACK_PROXY, abi: payableAbi, functionName: "debt", args: [d.vault] }),
    destinationClient.getGasPrice(),
  ]);
  const [rcBalance, rcDebt, rcReserves, openTasks, cronSubscribed, paused, cronTopic, lasnaGasPrice, openTaskIds] = await Promise.all([
    lasnaClient.getBalance({ address: d.reactive }),
    lasnaClient.readContract({ address: SYSTEM_CONTRACT, abi: payableAbi, functionName: "debt", args: [d.reactive] }),
    lasnaClient.readContract({ address: SYSTEM_CONTRACT, abi: reservesAbi, functionName: "reserves", args: [d.reactive] }),
    lasnaClient.readContract({ address: d.reactive, abi: reactiveAbi, functionName: "openTaskCount" }),
    lasnaClient.readContract({ address: d.reactive, abi: reactiveAbi, functionName: "cronSubscribed" }),
    lasnaClient.readContract({ address: d.reactive, abi: reactiveAbi, functionName: "paused" }),
    lasnaClient.readContract({ address: d.reactive, abi: reactiveAbi, functionName: "cronTopic" }),
    lasnaClient.getGasPrice(),
    lasnaClient.readContract({ address: d.reactive, abi: reactiveAbi, functionName: "getOpenTasks" }),
  ]);
  // Deadlines of the tasks the reactive contract is watching, read from the vault (the source of truth).
  const watched = openTaskIds.length
    ? await destinationClient.multicall({
        allowFailure: false,
        contracts: openTaskIds.slice(0, 20).map((id) => ({ address: d.vault, abi: vaultAbi, functionName: "getTask" as const, args: [id] as const })),
      })
    : [];
  const watchedTasks = openTaskIds.slice(0, 20).map((id, i) => ({ id, deadline: watched[i].deadline, state: watched[i].state }));
  return { vaultBalance, proxyDebt, destGasPrice, rcBalance, rcDebt, rcReserves, openTasks, cronSubscribed, paused, cronTopic, lasnaGasPrice, watchedTasks };
}

export type FundingHealth = Awaited<ReturnType<typeof readFundingHealth>>;

export type AnyLog = Log;
