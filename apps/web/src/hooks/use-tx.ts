"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfig } from "wagmi";
import { waitForTransactionReceipt, writeContract, type WriteContractParameters } from "wagmi/actions";
import type { Abi, ContractFunctionArgs, ContractFunctionName } from "viem";
import type { wagmiConfig } from "@/lib/wagmi";
import { BaseError, ContractFunctionRevertedError, type Hash } from "viem";
import { useQueryClient } from "@tanstack/react-query";

export type TxStatus = "idle" | "signing" | "pending" | "confirmed" | "failed";


const JOURNAL_KEY = "coftra.txJournal.v1";

export type JournalEntry = { hash: Hash; label: string; at: number };

/** Non-authoritative list of recently submitted hashes so a reloaded tab can reconcile them on-chain. */
export function readJournal(): JournalEntry[] {
  try {
    return JSON.parse(localStorage.getItem(JOURNAL_KEY) ?? "[]") as JournalEntry[];
  } catch {
    return [];
  }
}

function addJournal(e: JournalEntry) {
  try {
    const next = [e, ...readJournal().filter((x) => x.hash !== e.hash)].slice(0, 20);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: chain state remains the source of truth */
  }
}

export function explainError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name) return `${humanError[name] ?? name}`;
    }
    if (e.shortMessage.toLowerCase().includes("user rejected")) return "You rejected the request in your wallet.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : "Unknown error";
}

const humanError: Record<string, string> = {
  TokenNotAllowed: "This token is not supported by the vault.",
  CreationIsPaused: "New tasks are paused by the vault admin. Existing tasks and refunds are unaffected.",
  InvalidAmount: "Amount is zero or below the vault's minimum deposit for this token.",
  InvalidAddress: "One of the addresses is invalid.",
  InvalidDeadline: "Deadline must be at least 2 minutes and at most 365 days away.",
  InvalidMilestones: "Milestones are invalid: each needs an amount and a verifier, and the total cannot exceed the budget.",
  InvalidSession: "This session configuration is not allowed.",
  NotTaskOwner: "Only the task owner can do this.",
  NotExecutor: "Only the active executor can do this.",
  WrongState: "The task is not in a state that allows this action.",
  DeadlinePassed: "The deadline has passed.",
  RecoveryNotYetAvailable: "Manual recovery opens 30 minutes after the deadline.",
  SessionCallRejected: "The call does not match the permitted operation.",
  SessionCallFailed: "The permitted call reverted at the target contract.",
  SpendLimitExceeded: "This would exceed the spending cap or the available balance.",
  UnsupportedTokenBehaviour: "Token behaviour not supported (fee-on-transfer or unexpected balance change).",
  OutcomeAlreadyWatched: "Another active session already watches this outcome for this beneficiary.",
  NothingToClaim: "Nothing to claim.",
  NotAttestable: "This milestone can't be attested by this address right now.",
  AttestationCooldown: "You attested this milestone in the last 5 minutes. Wait before trying again.",
};

export function useTx() {
  const config = useConfig();
  const qc = useQueryClient();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [hash, setHash] = useState<Hash>();
  const [error, setError] = useState<string>();

  const run = useCallback(
    async <
      const abi extends Abi,
      fn extends ContractFunctionName<abi, "nonpayable" | "payable">,
      args extends ContractFunctionArgs<abi, "nonpayable" | "payable", fn>,
    >(
      label: string,
      params: WriteContractParameters<abi, fn, args, typeof wagmiConfig>,
    ) => {
      setError(undefined);
      setHash(undefined);
      setStatus("signing");
      try {
        // Call sites are fully typed by the generic signature above; widen only for the internal call.
        const h = await writeContract(config, params as never);
        setHash(h);
        addJournal({ hash: h, label, at: Date.now() });
        setStatus("pending");
        const r = await waitForTransactionReceipt(config, { hash: h });
        if (r.status !== "success") throw new Error("Transaction reverted on-chain.");
        setStatus("confirmed");
        await qc.invalidateQueries();
        return r;
      } catch (e) {
        setError(explainError(e));
        setStatus("failed");
        return null;
      }
    },
    [config, qc],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(undefined);
    setHash(undefined);
  }, []);

  return { run, status, hash, error, reset, busy: status === "signing" || status === "pending" };
}

/** Reconcile journal entries with chain receipts after a reload. */
export function useJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read browser storage after mount only
    setEntries(readJournal());
  }, []);
  return entries;
}
