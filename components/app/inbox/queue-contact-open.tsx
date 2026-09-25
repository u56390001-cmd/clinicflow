"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { openQueueConversationAction } from "@/lib/actions/inbox";
import { cn } from "@/lib/utils";

/**
 * Clickable wrapper for a queue-contact row in the messages thread list.
 * Clicking get-or-creates the patient's WhatsApp conversation (service-role
 * insert — members have no INSERT policy on conversations) and routes to the
 * open chat for that thread.
 */
export function QueueContactOpen({
  visitId,
  className,
  children,
}: {
  visitId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleOpen = () => {
    if (pending) return;
    setPending(true);
    void openQueueConversationAction(visitId).then((result) => {
      if (result.ok && result.data) {
        router.push(`/app/inbox?c=${result.data.conversationId}`);
        return;
      }
      setPending(false);
    });
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      disabled={pending}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 px-4 py-[10px] text-left transition-colors hover:bg-gray-50 disabled:opacity-60",
        className,
      )}
    >
      {pending ? (
        <span className="ml-1 flex-shrink-0">
          <Spinner className="h-4 w-4" />
        </span>
      ) : (
        children
      )}
    </button>
  );
}