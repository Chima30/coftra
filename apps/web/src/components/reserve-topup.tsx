"use client";

import { useState } from "react";
import { useAccount, useBalance, useConfig, useSwitchChain } from "wagmi";
import { sendTransaction, waitForTransactionReceipt } from "wagmi/actions";
import { encodeFunctionData, parseAbi, parseEther, type Hash } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { lasna, SYSTEM_CONTRACT } from "@/lib/chains";
import { fmtNative } from "@/lib/format";
import { deploymentInfo } from "@/hooks/use-coftra";
import { explainError } from "@/hooks/use-tx";
import { Hex } from "./hex";
import { Button, Card, CardHeader, Field, Input } from "./ui/primitives";
import { useFundingAssessment } from "./funding";

const MAX = "10";
const systemAbi = parseAbi(["function depositTo(address) payable"]);

/**
 * Anyone can add lREACT to the reactive contract's execution reserve via the official system contract
 * (dev.reactive.network/economy). This keeps automation running for every task; it is not a deposit.
 */
export function ReserveTopUp() {
  const d = deploymentInfo!;
  const config = useConfig();
  const qc = useQueryClient();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const bal = useBalance({ address, chainId: lasna.id });
  const { assessment } = useFundingAssessment();
  const [amount, setAmount] = useState("1");
  const [ack, setAck] = useState(false);
  const [state, setState] = useState<{ status: "idle" | "signing" | "pending" | "confirmed" | "failed"; hash?: Hash; error?: string }>({ status: "idle" });

  let value: bigint | null = null;
  let amountError: string | null = null;
  try {
    value = amount.trim() ? parseEther(amount.trim()) : null;
  } catch {
    amountError = "Enter a number such as 1.";
  }
  if (!amountError) {
    if (value === null || value <= 0n) amountError = "Enter an amount greater than zero.";
    else if (value > parseEther(MAX)) amountError = `Up to ${MAX} lREACT per top-up.`;
    else if (bal.data && value >= bal.data.value) amountError = "That's your whole balance; leave some lREACT for gas.";
  }
  const onLasna = chainId === lasna.id;
  const busy = state.status === "signing" || state.status === "pending";
  const addedHours = value && !amountError ? Number(value) / 1e18 / 0.00785 / 60 : null;

  const send = async () => {
    if (!value || amountError || !ack) return;
    try {
      setState({ status: "signing" });
      const hash = await sendTransaction(config, {
        to: SYSTEM_CONTRACT,
        data: encodeFunctionData({ abi: systemAbi, functionName: "depositTo", args: [d.reactive] }),
        value,
        chainId: lasna.id,
      });
      setState({ status: "pending", hash });
      const r = await waitForTransactionReceipt(config, { hash, chainId: lasna.id });
      setState({ status: r.status === "success" ? "confirmed" : "failed", hash, error: r.status === "success" ? undefined : "Reverted" });
      if (r.status === "success") {
        setAck(false);
        await qc.invalidateQueries({ queryKey: ["funding"] });
      }
    } catch (e) {
      setState({ status: "failed", error: explainError(e) });
    }
  };

  return (
    <Card>
      <CardHeader
        title="Keep automation running (optional)"
        description="Adds lREACT to the reactive contract's execution reserve on Reactive Lasna, which pays for reactions and scheduled checks for every task."
      />
      <div className="space-y-4 p-5 text-sm">
        {assessment && (
          <p className="text-fg-muted">
            Current reserve covers ≈ <span className="font-medium text-fg">{assessment.runwayHoursWhileOpen.toFixed(1)} h</span> of automation while tasks are open.
          </p>
        )}
        <div className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-[13px]">
          <div className="font-medium text-warning">Not a deposit</div>
          <p className="mt-1 text-fg-muted">
            lREACT sent here is consumed as automation runs. It can&apos;t be withdrawn, isn&apos;t credited to you or any task, and doesn&apos;t touch task
            funds. Get test lREACT from the Reactive faucet (dev.reactive.network). Testnet only.
          </p>
        </div>
        {!isConnected ? (
          <p className="text-fg-muted">Connect a wallet to top up.</p>
        ) : !onLasna ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-fg-muted">This top-up is sent on Reactive Lasna (chain 5318007).</span>
            <Button size="sm" variant="secondary" disabled={switching} onClick={() => switchChain({ chainId: lasna.id })}>
              Switch to Reactive Lasna
            </Button>
          </div>
        ) : (
          <>
            <Field
              label="Amount (lREACT)"
              htmlFor="reserve-topup"
              error={amountError}
              hint={`Your balance: ${fmtNative(bal.data?.value, "lREACT", 4)}${addedHours ? ` · adds ≈ ${addedHours.toFixed(1)} h of runway` : ""}`}
            >
              <Input id="reserve-topup" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="sm:w-48" aria-invalid={!!amountError} />
            </Field>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>I understand this pays for automation and can&apos;t be withdrawn.</span>
            </label>
            <Button variant="secondary" disabled={!ack || !!amountError || busy} onClick={send}>
              {busy ? "Waiting…" : `Add ${value && !amountError ? fmtNative(value, "lREACT", 4) : ""} to the reserve`}
            </Button>
            <p className="text-xs text-fg-subtle">Switch back to Base Sepolia afterwards to use the rest of the app.</p>
          </>
        )}
        {state.status !== "idle" && (
          <div role="status" aria-live="polite" className={state.status === "failed" ? "text-danger" : state.status === "confirmed" ? "text-success" : "text-fg-muted"}>
            {state.status === "signing" && "Confirm in your wallet…"}
            {state.status === "pending" && "Submitted. Waiting for confirmation on Lasna…"}
            {state.status === "confirmed" && "Added to the reserve."}
            {state.status === "failed" && (state.error ?? "Failed.")}
            {state.hash && (
              <span className="ml-2">
                <Hex value={state.hash} kind="tx" chainId={lasna.id} />
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
