/**
 * Fork simulation of the Rule Builder's transaction flow against the LIVE contract code.
 *
 * Runs only when COFTRA_FORK_RPC points at an anvil fork of Base Sepolia:
 *   anvil --fork-url https://base-sepolia-rpc.publicnode.com --port 8545
 *   COFTRA_FORK_RPC=http://127.0.0.1:8545 pnpm test
 * Nothing is broadcast to a real network. Reactive callbacks don't exist on a fork, so this covers the
 * user-signed half (approve, create, attest, owner override, session spend, cancel) and the vault's checks.
 */
import { describe, expect, it } from "vitest";
import { createTestClient, http, parseEventLogs, publicActions, walletActions, encodeFunctionData, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { deployment, demoNftAbi, mockUsdcAbi, registryAbi, vaultAbi } from "./contracts/generated";
import { approveArgs, projectCreateArgs, sessionCreateArgs } from "./tx-builders";
import { TaskKind, TaskState } from "./protocol";

const RPC = process.env.COFTRA_FORK_RPC;
const d = deployment!;

const OWNER = "0x00000000000000000000000000000000c0f7a001" as Address;
const RECIPIENT = "0x00000000000000000000000000000000c0f7a002" as Address;
const EXECUTOR = "0x00000000000000000000000000000000c0f7a003" as Address;

describe.skipIf(!RPC)("Rule Builder flow on a fork of the live contracts", () => {
  const client = createTestClient({ chain: baseSepolia, mode: "anvil", transport: http(RPC) }).extend(publicActions).extend(walletActions);

  async function send(from: Address, to: Address, data: `0x${string}`) {
    const hash = await client.sendTransaction({ account: from, to, data, chain: baseSepolia });
    const r = await client.waitForTransactionReceipt({ hash });
    expect(r.status, `tx to ${to}`).toBe("success");
    return r;
  }

  it("creates, funds, attests and overrides a project budget exactly as configured", async () => {
    for (const a of [OWNER, RECIPIENT, EXECUTOR]) {
      await client.impersonateAccount({ address: a });
      await client.setBalance({ address: a, value: 10n ** 18n });
    }
    await send(OWNER, d.token, encodeFunctionData({ abi: mockUsdcAbi, functionName: "mint", args: [OWNER, 1_000_000_000n] }));

    const block = await client.getBlock();
    const rule = {
      kind: TaskKind.ProjectBudget as const,
      amount: 100_000_000n,
      recipient: RECIPIENT,
      refundTo: OWNER,
      deadline: Number(block.timestamp) + 15 * 60,
      milestones: [
        { amount: 30_000_000n, verifier: OWNER },
        { amount: 50_000_000n, verifier: OWNER },
      ],
    };

    // Exact approval, then create + activate.
    await send(OWNER, d.token, encodeFunctionData({ abi: mockUsdcAbi, functionName: "approve", args: approveArgs(rule, d.vault!) }));
    expect(await client.readContract({ address: d.token, abi: mockUsdcAbi, functionName: "allowance", args: [OWNER, d.vault!] })).toBe(100_000_000n);

    const r = await send(OWNER, d.vault!, encodeFunctionData({ abi: vaultAbi, functionName: "createProjectTask", args: projectCreateArgs(rule, d.token, true) }));
    const created = parseEventLogs({ abi: vaultAbi, logs: r.logs, eventName: "TaskCreated" })[0];
    const id = created.args.taskId;
    expect(await client.readContract({ address: d.token, abi: mockUsdcAbi, functionName: "allowance", args: [OWNER, d.vault!] })).toBe(0n);

    // On-chain configuration equals what the builder previewed.
    const t = await client.readContract({ address: d.vault!, abi: vaultAbi, functionName: "getTask", args: [id] });
    expect(t.state).toBe(TaskState.Active);
    expect(t.deposited).toBe(rule.amount);
    expect(t.recipient.toLowerCase()).toBe(RECIPIENT);
    expect(t.refundTo.toLowerCase()).toBe(OWNER);
    expect(Number(t.deadline)).toBe(rule.deadline);
    const ms = await client.readContract({ address: d.vault!, abi: vaultAbi, functionName: "getMilestones", args: [id] });
    expect(ms.map((m) => m.amount)).toEqual([30_000_000n, 50_000_000n]);
    expect(ms.every((m) => m.verifier.toLowerCase() === OWNER)).toBe(true);

    // Verifier attestation is accepted by the registry (the origin event Reactive would relay).
    expect(await client.readContract({ address: d.vault!, abi: vaultAbi, functionName: "canAttest", args: [id, 0n, OWNER, 1n] })).toBe(true);
    const att = await send(OWNER, d.verifierRegistry, encodeFunctionData({ abi: registryAbi, functionName: "attest", args: [id, 0n, 1n] }));
    expect(parseEventLogs({ abi: registryAbi, logs: att.logs, eventName: "MilestoneVerified" })).toHaveLength(1);

    // Owner override pays checkpoint 2 directly; it is flagged as not via Reactive.
    const ov = await send(OWNER, d.vault!, encodeFunctionData({ abi: vaultAbi, functionName: "ownerReleaseMilestone", args: [id, 1n] }));
    const rel = parseEventLogs({ abi: vaultAbi, logs: ov.logs, eventName: "MilestoneReleased" })[0];
    expect(rel.args.viaReactive).toBe(false);
    expect(await client.readContract({ address: d.token, abi: mockUsdcAbi, functionName: "balanceOf", args: [RECIPIENT] })).toBe(50_000_000n);
  });

  it("creates a spending session, lets only the executor mint to the owner, and refunds on cancel", async () => {
    const block = await client.getBlock();
    const rule = {
      kind: TaskKind.SpendingSession as const,
      amount: 40_000_000n,
      refundTo: OWNER,
      deadline: Number(block.timestamp) + 60 * 60,
      executor: EXECUTOR,
      target: d.demoNft,
      beneficiary: OWNER,
      spendCap: 25_000_000n,
      operation: "mint(beneficiary)",
    };
    await send(OWNER, d.token, encodeFunctionData({ abi: mockUsdcAbi, functionName: "approve", args: approveArgs(rule, d.vault!) }));
    const r = await send(OWNER, d.vault!, encodeFunctionData({ abi: vaultAbi, functionName: "createSessionTask", args: sessionCreateArgs(rule, d.token, true) }));
    const id = parseEventLogs({ abi: vaultAbi, logs: r.logs, eventName: "TaskCreated" })[0].args.taskId;

    const mint = encodeFunctionData({ abi: demoNftAbi, functionName: "mint", args: [OWNER] });
    const exec = await send(EXECUTOR, d.vault!, encodeFunctionData({ abi: vaultAbi, functionName: "executeSession", args: [id, 25_000_000n, mint] }));
    expect(parseEventLogs({ abi: vaultAbi, logs: exec.logs, eventName: "SessionExecuted" })[0].args.spent).toBe(25_000_000n);

    const before = await client.readContract({ address: d.token, abi: mockUsdcAbi, functionName: "balanceOf", args: [OWNER] });
    await send(OWNER, d.vault!, encodeFunctionData({ abi: vaultAbi, functionName: "cancel", args: [id] }));
    const after = await client.readContract({ address: d.token, abi: mockUsdcAbi, functionName: "balanceOf", args: [OWNER] });
    expect(after - before).toBe(15_000_000n);
    const s = await client.readContract({ address: d.vault!, abi: vaultAbi, functionName: "getSession", args: [id] });
    expect(s.executorActive).toBe(false);
  });
});
