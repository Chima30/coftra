"use client";

import { useState } from "react";
import { Check, Link2, Send } from "lucide-react";
import { Button } from "./ui/primitives";

function CopyLink({ path, label, icon }: { path: string; label: string; icon: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="w-full"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${path}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? <Check className="size-4" /> : icon}
      {copied ? "Link copied" : label}
    </Button>
  );
}

/**
 * Copies the public task URL. Task pages need no wallet, so anyone can open the link.
 * For project budgets there is also a recipient link, which opens the page explained from their side.
 */
export function ShareTaskButton({ taskId, forRecipient = false }: { taskId: bigint; forRecipient?: boolean }) {
  return (
    <div className="space-y-1">
      <CopyLink path={`/tasks/${taskId}`} label="Copy link to this task" icon={<Link2 className="size-4" />} />
      {forRecipient && (
        <CopyLink path={`/tasks/${taskId}?for=recipient`} label="Copy link for the recipient" icon={<Send className="size-4" />} />
      )}
      <p className="text-center text-xs text-fg-subtle">Anyone can open it without a wallet. Private names aren&apos;t included.</p>
    </div>
  );
}
