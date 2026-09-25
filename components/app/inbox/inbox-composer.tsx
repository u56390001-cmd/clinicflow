"use client";

import { Send } from "lucide-react";
import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { sendStaffReplyAction } from "@/lib/actions/inbox";

/**
 * Manual reply composer for the takeover inbox — round pill input with a
 * circular send button, matching the messages dashboard reference.
 * Sending a reply implies human engagement — the server action auto-enables
 * `human_takeover` if it wasn't already set, so the AI never double-replies.
 */
export function InboxComposer({
  conversationId,
}: {
  conversationId: string;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSend = text.trim().length > 0 && !isPending;

  const handleSend = () => {
    const body = text.trim();
    if (!body || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await sendStaffReplyAction(conversationId, body);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setText("");
    });
  };

  return (
    <div className="flex-shrink-0 border-t border-gray-200 bg-white">
      {error ? (
        <div className="px-4 pt-3">
          <Alert variant="destructive">{error}</Alert>
        </div>
      ) : null}
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSend();
            }
          }}
          maxLength={1000}
          placeholder="Type a reply..."
          disabled={isPending}
          aria-label="Reply message"
          className="min-w-0 flex-1 rounded-[24px] border-none bg-[#F0F2F5] px-[18px] py-[11px] text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-full border-none transition-colors disabled:cursor-not-allowed"
          style={{
            backgroundColor: canSend ? "#1DAA61" : "#E5E7EB",
          }}
        >
          {isPending ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Send
              aria-hidden="true"
              className="h-4 w-4"
              style={{
                color: canSend ? "#ffffff" : "#9CA3AF",
                marginLeft: 2,
              }}
            />
          )}
        </button>
      </div>
    </div>
  );
}