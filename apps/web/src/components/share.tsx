"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "./ui/primitives";

/** Copies the public task URL. Task pages need no wallet, so anyone can open the link. */
export function ShareTaskButton({ taskId }: { taskId: bigint }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="ghost"
        className="w-full"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(`${window.location.origin}/tasks/${taskId}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
        {copied ? "Link copied" : "Copy link to this task"}
      </Button>
      <p className="text-center text-xs text-fg-subtle">Anyone can open it without a wallet. Private names aren&apos;t included.</p>
    </div>
  );
}
