"use client";

import { useState } from "react";
import { useAccount, useBalance, useSwitchChain } from "wagmi";
import { parseEther } from "viem";
import { PageHeader, ThemeToggle } from "@/components/app-shell";
import { FundingDetail } from "@/components/funding";
import { ReserveTopUp } from "@/components/reserve-topup";
import { Hex } from "@/components/hex";
import { NotDeployed } from "@/components/states";
import { TxStatusLine } from "@/components/tx-status";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui/primitives";
import { deploymentInfo } from "@/hooks/use-coftra";
import { useJournal } from "@/hooks/use-tx";
import { useConfig } from "wagmi";
import { sendTransaction, waitForTransactionReceipt } from "wagmi/actions";
import { useQuery } from "@tanstack/react-query";
import { destinationClient } from "@/lib/wagmi";
import { destination, lasna } from "@/lib/chains";
import { CALLBACK_PROXY } from "@/lib/contracts";
import { fmtNative, relTime } from "@/lib/format";

export function SettingsView() {
  const d = deploymentInfo;
  return (
    <>
      <PageHeader title="Settings" description="Wallet, networks, automation funding and contract addresses." />
      {!d ? (
        <NotDeployed />
      ) : (
        <div className="space-y-6">
          <FundingDetail />
          <ReserveTopUp />
          <TopUp />
          <Card>
            <CardHeader title="Contracts" description="Open source; verify each address on its explorer." />
            <dl className="divide-y divide-border text-sm">
              {[
                ["CoftraVault (Base Sepolia)", d.vault, destination.id],
                ["CoftraReactive (Reactive Lasna)", d.reactive, lasna.id],
                ["Milestone verifier registry", d.verifierRegistry, destination.id],
                ["Test token tUSDC (no value)", d.token, destination.id],
                ["Demo NFT collection (testnet)", d.demoNft, destination.id],
                ["Reactive callback proxy", CALLBACK_PROXY, destination.id],
              ].map(([k, v, c]) => (
                <div key={k as string} className="grid gap-1 px-5 py-2.5 sm:grid-cols-[280px_1fr]">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd><Hex value={v as string} chainId={c as number} full /></dd>
                </div>
              ))}
            </dl>
          </Card>
          <RecentSubmissions />
          <Card>
            <CardHeader title="Preferences" description="Stored only in this browser. Nothing about your tasks is." />
            <div className="flex items-center justify-between px-5 py-4 text-sm">
              <span>Colour theme</span>
              <ThemeToggle />
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

const TOPUP_MAX = "0.01"; // testnet cap: more than enough for thousands of callbacks at observed costs

function TopUp() {
  const d = deploymentInfo!;
  const config = useConfig();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const bal = useBalance({ address, chainId: destination.id });
  const [amount, setAmount] = useState("0.001");
  const [ack, setAck] = useState(false);
  const [state, setState] = useState<{ status: "idle" | "signing" | "pending" | "confirmed" | "failed"; hash?: `0x${string}`; error?: string }>({ status: "idle" });

  let value: bigint | null = null;
  let amountError: string | null = null;
  try {
    value = amount.trim() ? parseEther(amount.trim()) : null;
  } catch {
    amountError = "Enter a number such as 0.001.";
  }
  if (!amountError) {
    if (value === null || value <= 0n) amountError = "Enter an amount greater than zero.";
    else if (value > parseEther(TOPUP_MAX)) amountError = `Capped at ${TOPUP_MAX} ETH. That already covers thousands of callbacks at observed testnet costs.`;
    else if (bal.data && value >= bal.data.value) amountError = "That's your whole balance; leave some ETH for gas.";
  }
  const wrongChain = isConnected && chainId !== destination.id;
  const busy = state.status === "signing" || state.status === "pending";

  const send = async () => {
    if (!value || amountError || !ack) return;
    try {
      setState({ status: "signing" });
      // chainId pins the transaction to Base Sepolia even if the wallet switches network mid-flow.
      const hash = await sendTransaction(config, { to: d.vault, value, chainId: destination.id });
      setState({ status: "pending", hash });
      const r = await waitForTransactionReceipt(config, { hash, chainId: destination.id });
      setState({ status: r.status === "success" ? "confirmed" : "failed", hash, error: r.status === "success" ? undefined : "Reverted" });
      setAck(false);
    } catch (e) {
      setState({ status: "failed", error: e instanceof Error ? e.message.split("\n")[0] : "Failed" });
    }
  };

  return (
    <Card>
      <CardHeader
        title="Top up callback funds (optional)"
        description="Pays for future Reactive callbacks on Base Sepolia. Most people never need this."
      />
      <div className="space-y-4 p-5">
        <div className="rounded-md border border-warning/40 bg-warning-soft p-3 text-[13px]">
          <div className="font-medium text-warning">This is not a task deposit</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg-muted">
            <li>ETH sent here becomes protocol operating funds. It is spent as callbacks run, for every user&apos;s tasks.</li>
            <li>It is not credited to you or to any task, and you cannot withdraw it. Only the vault admin can move it, and only native ETH.</li>
            <li>To fund a task, use Create Automation instead. Task deposits are tUSDC and always return to your refund address.</li>
          </ul>
        </div>
        {!isConnected ? (
          <p className="text-sm text-fg-muted">Connect a wallet on Base Sepolia to send a top-up.</p>
        ) : wrongChain ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-fg-muted">Your wallet is on another network. Top-ups only go to Base Sepolia.</span>
            <Button size="sm" variant="secondary" disabled={switching} onClick={() => switchChain({ chainId: destination.id })}>
              Switch to Base Sepolia
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <Field label="Amount (Base Sepolia ETH)" htmlFor="topup" error={amountError} hint={`Your balance: ${fmtNative(bal.data?.value, "ETH", 5)} · max ${TOPUP_MAX}`}>
                <Input id="topup" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="sm:w-48" aria-invalid={!!amountError} />
              </Field>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>I understand this is a non-refundable contribution to callback fees, not a deposit I can withdraw.</span>
            </label>
            <Button variant="secondary" disabled={!ack || !!amountError || busy} onClick={send}>
              Send {value && !amountError ? fmtNative(value, "ETH", 6) : ""} to callback funds
            </Button>
          </>
        )}
        <TxStatusLine status={state.status} hash={state.hash} error={state.error} />
      </div>
    </Card>
  );
}

/** Reconciles hashes submitted from this browser with on-chain receipts after a reload. */
function RecentSubmissions() {
  const entries = useJournal();
  const q = useQuery({
    queryKey: ["journal", entries.map((e) => e.hash).join()],
    enabled: entries.length > 0,
    queryFn: async () =>
      Promise.all(
        entries.map(async (e) => {
          try {
            const r = await destinationClient.getTransactionReceipt({ hash: e.hash });
            return { ...e, status: r.status === "success" ? "Confirmed" : "Reverted" };
          } catch {
            return { ...e, status: "Pending or not found" };
          }
        }),
      ),
  });
  if (entries.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Transactions sent from this browser" description="A convenience list. Status comes from the chain, so a closed tab never turns a submitted transaction into a failure." />
      <ul className="divide-y divide-border text-sm">
        {(q.data ?? entries.map((e) => ({ ...e, status: "Checking…" }))).map((e) => (
          <li key={e.hash} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
            <span>{e.label}</span>
            <span className="flex items-center gap-3 text-fg-muted">
              {e.status} · {relTime(e.at / 1000)}
              <Hex value={e.hash} kind="tx" chainId={destination.id} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
