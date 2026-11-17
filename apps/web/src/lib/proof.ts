import { erc20Abi, parseEventLogs, type Hash, type TransactionReceipt } from "viem";
import { destinationClient, lasnaClient } from "./wagmi";
import { lasna } from "./chains";
import { reactiveAbi, registryAbi, vaultAbi, demoNftAbi, type Deployment } from "./contracts";
import { readReactiveRequests, type VaultLog } from "./reads";
import { uintToHash } from "./format";
import { CallbackKind, CallbackResult } from "./protocol";

export type HandledLog = Extract<VaultLog, { eventName: "ReactiveCallbackHandled" }>;

export type ProofStep = {
  key: "origin" | "reactive" | "callback" | "destination" | "outcome";
  title: string;
  status: "confirmed" | "missing" | "rejected";
  chainId: number;
  txHash?: Hash;
  detail: { label: string; value: string; mono?: boolean; href?: string }[];
};

export type Proof = {
  taskId: bigint;
  kind: CallbackKind;
  result: CallbackResult;
  steps: ProofStep[];
  balanceChanges: { token: string; from: string; to: string; amount: bigint }[];
  costs: { label: string; wei: bigint; symbol: string }[];
};

const CRON_EMITTER = "0x0000000000000000000000000000000000ffffff";

async function receipt(chainId: number, hash: Hash): Promise<TransactionReceipt | null> {
  const client = chainId === lasna.id ? lasnaClient : destinationClient;
  try {
    return await client.getTransactionReceipt({ hash });
  } catch {
    return null;
  }
}

/** Rebuild the full origin -> reactive -> destination trail for one handled callback, from chain data only. */
export async function buildProof(d: Deployment, log: HandledLog): Promise<Proof> {
  const { taskId, kind, originTxHash, originChainId, result } = log.args as {
    taskId: bigint;
    kind: number;
    originTxHash: bigint;
    originChainId: bigint;
    result: number;
  };
  const originHash = uintToHash(originTxHash);
  const originChain = Number(originChainId);

  const [originRcpt, requests, destRcpt] = await Promise.all([
    receipt(originChain, originHash),
    readReactiveRequests(d, { originTxHash }).catch(() => []),
    receipt(destinationClient.chain.id, log.transactionHash),
  ]);
  const request = requests.find((r) => Number(r.args.kind) === kind);
  const reactiveRcpt = request ? await receipt(lasna.id, request.transactionHash) : null;

  // ---- origin event
  const originDetail: ProofStep["detail"] = [{ label: "Chain", value: `${originChain}` }];
  if (originRcpt) {
    if (kind === CallbackKind.Milestone) {
      const ev = parseEventLogs({ abi: registryAbi, logs: originRcpt.logs, eventName: "MilestoneVerified" })[0];
      if (ev) {
        originDetail.push(
          { label: "Emitter", value: ev.address, mono: true },
          { label: "Event", value: "MilestoneVerified(uint256,uint256,address,uint64)", mono: true },
          { label: "Verifier", value: ev.args.verifier, mono: true },
          { label: "Milestone", value: `#${Number(ev.args.milestoneIndex) + 1}` },
        );
      }
    } else if (kind === CallbackKind.Outcome) {
      const ev = parseEventLogs({ abi: demoNftAbi, logs: originRcpt.logs, eventName: "Transfer" }).find(
        (l) => l.args.from === "0x0000000000000000000000000000000000000000",
      );
      if (ev) {
        originDetail.push(
          { label: "Emitter", value: ev.address, mono: true },
          { label: "Event", value: "Transfer(address,address,uint256) — mint", mono: true },
          { label: "Minted to", value: ev.args.to, mono: true },
          { label: "Token id", value: ev.args.tokenId.toString() },
        );
      }
    } else {
      const cron = originRcpt.logs.find((l) => l.address.toLowerCase() === CRON_EMITTER);
      originDetail.push(
        { label: "Emitter", value: cron?.address ?? CRON_EMITTER, mono: true },
        { label: "Event", value: "Reactive Cron tick", mono: false },
      );
    }
  }

  // ---- reactive transaction
  const reactiveDetail: ProofStep["detail"] = [{ label: "Reactive contract", value: d.reactive, mono: true }];
  if (reactiveRcpt) {
    const reqEvents = parseEventLogs({ abi: reactiveAbi, logs: reactiveRcpt.logs, eventName: "CallbackRequested" });
    reactiveDetail.push(
      { label: "Callback requests in tx", value: `${reqEvents.length}` },
      { label: "Block", value: reactiveRcpt.blockNumber.toString() },
    );
  }

  // ---- destination
  const destDetail: ProofStep["detail"] = [
    { label: "Callback target", value: d.vault, mono: true },
    { label: "Result", value: CallbackResult[result] ?? `${result}` },
  ];
  const balanceChanges: Proof["balanceChanges"] = [];
  const costs: Proof["costs"] = [];
  if (destRcpt) {
    destDetail.push({ label: "Gas used", value: destRcpt.gasUsed.toString() });
    for (const t of parseEventLogs({ abi: erc20Abi, logs: destRcpt.logs, eventName: "Transfer" })) {
      if (t.address.toLowerCase() === d.token.toLowerCase()) {
        balanceChanges.push({ token: t.address, from: t.args.from, to: t.args.to, amount: t.args.value });
      }
    }
    if (destRcpt.effectiveGasPrice) {
      costs.push({ label: "Destination callback (Base Sepolia)", wei: destRcpt.gasUsed * destRcpt.effectiveGasPrice, symbol: "ETH" });
    }
    const settled = parseEventLogs({ abi: vaultAbi, logs: destRcpt.logs, eventName: "TaskClosed" })[0];
    if (settled) destDetail.push({ label: "Final state", value: ["None", "Funded", "Active", "Completed", "Expired", "Cancelled"][settled.args.finalState] ?? "?" });
  }
  if (reactiveRcpt) {
    // Reactive transactions carry no gas price (effectiveGasPrice is null on Lasna): the reaction fee
    // is billed to the reactive contract's reserves by the system contract, so show gas used instead.
    reactiveDetail.push({ label: "react() gas used", value: reactiveRcpt.gasUsed.toString() });
    if (reactiveRcpt.effectiveGasPrice) {
      costs.push({ label: "Reactive transaction (Lasna)", wei: reactiveRcpt.gasUsed * reactiveRcpt.effectiveGasPrice, symbol: "lREACT" });
    }
  }
  if (originRcpt && originChain !== lasna.id && originRcpt.effectiveGasPrice) {
    costs.push({ label: "Origin transaction", wei: originRcpt.gasUsed * originRcpt.effectiveGasPrice, symbol: "ETH" });
  }

  const applied = result === CallbackResult.Applied || result === CallbackResult.AlreadyApplied;
  const steps: ProofStep[] = [
    {
      key: "origin",
      title: kind === CallbackKind.Expiry ? "Scheduled check (Reactive Cron)" : "Origin event",
      status: originRcpt ? "confirmed" : "missing",
      chainId: originChain,
      txHash: originHash,
      detail: originDetail,
    },
    {
      key: "reactive",
      title: "Reactive transaction — react() requested a callback",
      status: reactiveRcpt ? "confirmed" : "missing",
      chainId: lasna.id,
      txHash: request?.transactionHash,
      detail: reactiveDetail,
    },
    {
      key: "destination",
      title: "Destination callback — vault re-checked the rule",
      status: destRcpt ? (applied ? "confirmed" : "rejected") : "missing",
      chainId: destinationClient.chain.id,
      txHash: log.transactionHash,
      detail: destDetail,
    },
  ];

  return { taskId, kind: kind as CallbackKind, result: result as CallbackResult, steps, balanceChanges, costs };
}
