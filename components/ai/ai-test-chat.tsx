"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatResponse =
  | { ok: true; reply: string; outcome: string; bookingAttempted: boolean }
  | { ok: false; error: string };

const SUGGESTIONS = [
  "What are your opening hours?",
  "What services do you offer and how much do they cost?",
  "I'd like to book an appointment.",
];

export function AiTestChat({ clinicName }: { clinicName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);

  async function send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setError(null);
    const history = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(history);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          messages: history,
        }),
      });
      const data: ChatResponse = await response.json();
      if (!response.ok || !data.ok) {
        const message =
          "error" in data && data.error
            ? data.error
            : "The assistant couldn't reply. Please try again.";
        setError(message);
        if (response.status === 429) {
          setMessages((current) => current.slice(0, -1));
        }
        return;
      }
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.reply },
      ]);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    void send(input);
    setInput("");
  }

  return (
    <Card className="flex max-h-[70vh] min-h-[28rem] flex-col">
      <CardHeader className="border-b border-text-muted/20">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle>Try the assistant</CardTitle>
        </div>
        <CardDescription>
          Chat with {clinicName}&apos;s AI receptionist. It can answer FAQs,
          check real availability and book, reschedule or cancel appointments.
        </CardDescription>
      </CardHeader>

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto p-4"
        aria-live="polite"
      >
        {messages.length === 0 && !pending && (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">
              Ask it a question or tap a suggestion to start.
            </p>
            <ul className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="rounded-full border border-text-muted/30 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={cn(
              "flex",
              message.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                message.role === "user"
                  ? "rounded-br-md bg-primary text-white"
                  : "rounded-bl-md border border-text-muted/20 bg-app text-text-primary",
              )}
            >
              {message.content}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-text-muted/20 bg-app px-4 py-2.5 text-sm text-text-secondary">
              <Spinner size="sm" />
              Thinking…
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-status-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      <CardContent className="border-t border-text-muted/20 pt-4">
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
                setInput("");
              }
            }}
            placeholder={`Message ${clinicName}'s assistant…`}
            aria-label="Message the AI assistant"
            rows={2}
            className="flex-1 resize-none rounded-control border border-text-muted/40 bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted hover:border-text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button type="submit" disabled={pending || input.trim().length === 0}>
            <Send aria-hidden="true" />
            Send
          </Button>
        </form>
        <p className="mt-2 text-xs text-text-muted">
          This is a test conversation and is restricted to clinic owners and
          admins.
        </p>
      </CardContent>
    </Card>
  );
}
