"use client";

import type { TaskView } from "@/lib/reads";
import { shortHex } from "@/lib/format";
import { Notice } from "./ui/primitives";
import { IncomingCard } from "./role-cards";

/**
 * Shown when a project budget is opened from the owner's "link for the recipient". Explains Coftra from
 * the side of the person being paid, who may never have heard of it and may not have a wallet connected.
 */
export function RecipientWelcome({ t, viewerIsRecipient }: { t: TaskView; viewerIsRecipient: boolean }) {
  return (
    <div className="space-y-3">
      <Notice title="Someone is paying you through Coftra">
        The money for this project is already locked in a vault contract, so it can&apos;t be spent on anything else. Each
        checkpoint below is paid to the recipient address ({shortHex(t.task.recipient)}) automatically as soon as its verifier confirms it. You
        don&apos;t need to do anything or connect a wallet to follow along.
        {!viewerIsRecipient && " Connect the recipient wallet to see this as yours."}
      </Notice>
      {!viewerIsRecipient && <IncomingCard t={t} me={t.task.recipient} linked={false} title="What the recipient gets" />}
    </div>
  );
}
