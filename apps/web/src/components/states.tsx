"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { useEffect, useState } from "react";
import { Card, Notice, buttonStyles } from "./ui/primitives";
import { ConnectButton } from "./app-shell";
import { deploymentInfo } from "@/hooks/use-coftra";

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    // No overflow clipping: actions such as the wallet menu open below the card.
    <Card className="flex flex-col items-center rounded-[32px] px-6 py-14 text-center">
      {icon && <div className="mb-3 text-fg-subtle">{icon}</div>}
      <h3 className="text-[26px] text-fg">{title}</h3>
      {body && <p className="mt-2 max-w-md text-[13px] leading-relaxed text-fg-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

/** Shown wherever live data is needed but the contracts aren't deployed. No placeholder numbers. */
export function NotDeployed() {
  return (
    <EmptyState
      title="Contracts not deployed yet"
      body={
        <>
          This build has no deployment record, so there is no real data to show. Deploy with the steps in{" "}
          <code className="font-mono text-xs">docs/deployment/DEPLOY.md</code>, then run{" "}
          <code className="font-mono text-xs">pnpm sync:contracts</code>.
        </>
      }
      action={
        <Link href="/templates" className={buttonStyles({ variant: "secondary" })}>
          Read how the templates work
        </Link>
      }
    />
  );
}

/** Gate children on deployment + wallet, with honest explanations instead of fake content. */
export function RequireWallet({ children, why }: { children: ReactNode; why: string }) {
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- wallet state is client-only
  useEffect(() => setMounted(true), []);
  if (!deploymentInfo) return <NotDeployed />;
  if (!mounted) return null;
  if (!isConnected) return <EmptyState title="Connect a wallet" body={why} action={<ConnectButton align="center" />} />;
  return <>{children}</>;
}

/** When a refresh fails but earlier data is on screen: say so, and when it was read. */
export function StaleNotice({ error, at }: { error: unknown; at: number }) {
  if (!error || !at) return null;
  return (
    <div className="mb-4">
      <Notice tone="warning" title="Couldn't refresh from the chain">
        Showing what was read at {new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}. It retries by itself; your funds
        and tasks are unaffected.
      </Notice>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <EmptyState
      title="Couldn't load chain data"
      body={
        <>
          The RPC request failed: <span className="font-mono text-xs">{error instanceof Error ? error.message.slice(0, 160) : "unknown error"}</span>.
          Your funds and tasks are unaffected; this is only a display problem.
        </>
      }
      action={
        retry && (
          <button className={buttonStyles({ variant: "secondary" })} onClick={retry}>
            Try again
          </button>
        )
      }
    />
  );
}
