"use client";

import { useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { parseEther } from "viem";
import { PageHeader, ThemeToggle } from "@/components/app-shell";
import { FundingDetail } from "@/components/funding";
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

function TopUp() {
  const d = deploymentInfo!;
  const config = useConfig();
  const { address } = useAccount();
  const bal = useBalance({ address });
  const [amount, setAmount] = useState("0.001");
  const [state, setState] = useState<{ status: "idle" | "signing" | "pending" | "confirmed" | "failed"; hash?: `0x${string}`; error?: string }>({ status: "idle" });
  const send = async () => {
    try {
      setState({ status: "signing" });
      const hash = await sendTransaction(config, { to: d.vault, value: parseEther(amount) });
      setState({ status: "pending", hash });
      const r = await waitForTransactionReceipt(config, { hash });
      setState({ status: r.status === "success" ? "confirmed" : "failed", hash, error: r.status === "success" ? undefined : "Reverted" });
    } catch (e) {
      setState({ status: "failed", error: e instanceof Error ? e.message.split("\n")[0] : "Failed" });
    }
  };
  return (
    <Card>
      <CardHeader
        title="Top up callback funds"
        description="Optional. Sends Base Sepolia ETH to the vault so it can pay for future callbacks. This is a donation to protocol operations, not a deposit you can withdraw."
      />
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <Field label="Amount (ETH)" htmlFor="topup" hint={`Your balance: ${fmtNative(bal.data?.value, "ETH", 5)}`}>
          <Input id="topup" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="sm:w-48" />
        </Field>
        <Button variant="secondary" disabled={!address || state.status === "signing" || state.status === "pending"} onClick={send}>
          Send to vault
        </Button>
      </div>
      <div className="px-5 pb-4">
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
