"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  releaseConversationAction,
  takeoverConversationAction,
} from "@/lib/actions/inbox";
import { cn } from "@/lib/utils";

/**
 * "Bot Response" switch in the conversation header.
 *
 * ON  -> the AI answers automatically (human_takeover = false).
 * OFF -> a human takes over; inbound messages are stored and flagged unread
 *        but never answered by the bot.
 */
export function BotResponseToggle({
  conversationId,
  humanTakeover,
  labelClass = "text-gray-500",
}: {
  conversationId: string;
  humanTakeover: boolean;
  labelClass?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const botOn = !humanTakeover;

  const toggle = () => {
    if (isPending) return;
    startTransition(async () => {
      if (humanTakeover) {
        await releaseConversationAction(conversationId);
      } else {
        await takeoverConversationAction(conversationId);
      }
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <span className={cn("text-xs font-medium", labelClass)}>Bot Response</span>
      <button
        type="button"
        role="switch"
        aria-checked={botOn}
        aria-label={`Bot response ${botOn ? "on" : "off"}`}
        title={botOn ? "Bot answers automatically. Click to hand over to a human." : "Human handles this chat. Click to turn the bot back on."}
        onClick={toggle}
        disabled={isPending}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-60"
        style={{ backgroundColor: botOn ? "#1DAA61" : "#E5E7EB" }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-[left] duration-200"
          style={{ left: botOn ? "22px" : "2px" }}
        />
      </button>
    </div>
  );
}