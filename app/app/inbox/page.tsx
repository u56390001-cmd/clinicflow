import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";

import { BotResponseToggle } from "@/components/app/inbox/bot-response-toggle";
import { InboxAutoRefresh } from "@/components/app/inbox/inbox-auto-refresh";
import { InboxComposer } from "@/components/app/inbox/inbox-composer";
import { InboxThreadList } from "@/components/app/inbox/inbox-thread-list";
import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { cn } from "@/lib/utils";
import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { initialsOf } from "@/lib/header-activity";
import { fetchInboxFeed } from "@/lib/inbox-query";
import { createClient } from "@/lib/supabase/server";
import type { WhatsappMessage } from "@/types/database";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selectedId =
    typeof params.c === "string" && /^[0-9a-f-]{36}$/i.test(params.c)
      ? params.c
      : null;

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            WhatsApp inbox
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Answer patients directly when the AI hands a chat over.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  if (!canManageClinical(access.role)) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            WhatsApp inbox
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {access.clinic.name} · /{access.clinic.slug}
          </p>
        </div>
        <p className="text-sm text-text-secondary">
          You don&apos;t have access to the inbox. Ask an owner or admin for help.
        </p>
      </div>
    );
  }

  // Shared feed: conversations + today's queue patients as contacts.
  const feed = await fetchInboxFeed(supabase, access.clinic.id);
  const conversations = feed.conversations;
  const threads = feed.threads;
  const unreadCount = feed.unreadCount;

  let activeId = selectedId;
  const activeConversation =
    activeId !== null
      ? (conversations.find((c) => c.id === activeId) ?? null)
      : null;
  if (!activeConversation && conversations.length > 0) {
    activeId = conversations[0].id;
  }

  let messages: WhatsappMessage[] = [];
  if (activeId) {
    // The unread-clear update doesn't feed the messages render (the feed was
    // already loaded above), so both writes go out together instead of
    // stacking two sequential round trips on the critical path.
    const [messagesRes] = await Promise.all([
      supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", activeId)
        .order("sent_at", { ascending: true })
        .limit(200),
      // Opening a flagged thread clears its unread marker.
      supabase
        .from("whatsapp_conversations")
        .update({ unread_by_staff: false })
        .eq("id", activeId)
        .eq("unread_by_staff", true),
    ]);
    messages = messagesRes.data ?? [];
  }

  const current =
    activeConversation ??
    conversations.find((c) => c.id === activeId) ??
    null;

  const timezone = access.clinic.timezone;
  const name = current?.patient_name ?? current?.patient_whatsapp_number ?? "";
  const startedAt = current ? safeFormatDate(current.created_at, timezone) : null;

  return (
    <div data-app-wide className="min-w-0">
      <InboxAutoRefresh />
      <div
        className="flex flex-col overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100"
        style={{ height: "calc(100svh - 10.5rem)", maxHeight: "calc(100svh - 10.5rem)" }}
      >
        {/* Mobile "Messages" title, per reference */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 pb-2 pt-4 md:hidden">
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        </div>

        {/* Desktop unified header row: "Messages" column title + chat header
            (Bot Response toggle) inline on the same row. */}
        <div className="hidden flex-shrink-0 items-stretch md:flex">
          {/* Messages column title */}
          <div className="flex w-80 flex-shrink-0 flex-col justify-center border-b border-r border-gray-200 bg-white px-4 py-4">
            <h1 className="text-xl font-bold text-gray-900">Messages</h1>
            <p className="mt-0.5 text-xs text-gray-500">WhatsApp conversations</p>
          </div>

          {/* Chat header (desktop) — inline with the column title */}
          <div className="min-w-0 flex-1 border-b border-gray-200 bg-white">
            {current ? (
              <div className="flex h-full items-center justify-between px-6 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: "#0D9488" }}
                  >
                    {initialsOf(name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-gray-900">
                      {name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                      <span className="truncate">{current.patient_whatsapp_number}</span>
                      {startedAt ? (
                        <>
                          <span className="text-gray-300" aria-hidden="true">
                            •
                          </span>
                          <span className="shrink-0">{startedAt}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <BotResponseToggle
                    conversationId={current.id}
                    humanTakeover={current.human_takeover}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ flex: "1 1 0%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "row" }}>
          {/* Left column */}
          <div
            className={cn(
              "flex-col overflow-hidden border-r border-gray-200 bg-white",
              current
                ? "hidden md:flex md:w-80 md:flex-shrink-0"
                : "flex md:flex md:w-80 md:flex-shrink-0",
            )}
          >
            <InboxThreadList
              threads={threads}
              activeId={current?.id ?? null}
              unreadCount={unreadCount}
            />
          </div>

          {/* Right pane */}
          <div
            className="flex flex-col"
            style={{ flex: "1 1 0%", minWidth: 0, overflow: "hidden", height: "100%" }}
          >
            {current ? (
              <>
                {/* Mobile chat header (teal zone, md:hidden) — desktop uses the
                    unified header row above. */}
                <div
                  className="flex-shrink-0 md:hidden"
                  style={{
                    borderBottom: "1px solid rgb(229, 231, 235)",
                    backgroundColor: "rgb(7, 94, 84)",
                  }}
                >
                  <div className="flex items-center gap-3 px-3 py-2">
                    <Link
                      href="/app/inbox"
                      aria-label="Back to conversations"
                      className="flex-shrink-0 p-1 text-white"
                    >
                      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                    </Link>
                    <span
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ backgroundColor: "rgb(37, 211, 102)" }}
                    >
                      {initialsOf(name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">
                        {name}
                      </span>
                      <span className="block truncate text-xs text-green-200">
                        {current.patient_whatsapp_number}
                      </span>
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-1">
                      <BotResponseToggle
                        conversationId={current.id}
                        humanTakeover={current.human_takeover}
                        labelClass="text-white opacity-90"
                      />
                    </span>
                  </div>
                </div>

                {/* Chat message area */}
                <div className="flex-1 overflow-x-hidden overflow-y-auto bg-[#EFEAE2] p-3 md:p-5">
                  {messages.length === 0 ? (
                    <div className="flex h-64 items-center justify-center">
                      <div className="text-center">
                        <MessageSquare
                          aria-hidden="true"
                          className="mx-auto mb-4 h-16 w-16 text-gray-300"
                        />
                        <p className="mb-2 text-lg font-medium text-gray-600">
                          No messages yet
                        </p>
                        <p className="text-sm text-gray-400">
                          This conversation doesn&apos;t have any messages
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {messages.map((message) => {
                        const mine = message.sender_type !== "patient";
                        const timeLabel = safeFormatTime(message.sent_at, timezone);
                        return (
                          <div
                            key={message.id}
                            className={cn("flex", mine ? "justify-end" : "justify-start")}
                          >
                            <div
                              className={cn(
                                "max-w-[75%] rounded-card px-3 py-2 text-sm shadow-sm",
                                message.sender_type === "patient" &&
                                  "bg-white text-text-primary",
                                message.sender_type === "ai" &&
                                  "bg-primary/10 text-text-primary",
                                message.sender_type === "staff" &&
                                  "bg-secondary text-white",
                              )}
                            >
                              <p className="whitespace-pre-wrap break-words">
                                {message.content}
                              </p>
                              <p
                                className={cn(
                                  "mt-1 text-[10px]",
                                  message.sender_type === "staff"
                                    ? "text-white/70"
                                    : "text-text-muted",
                                )}
                              >
                                {message.sender_type === "patient"
                                  ? "Patient"
                                  : message.sender_type === "ai"
                                    ? "AI assistant"
                                    : `Staff${message.sender_name ? ` · ${message.sender_name}` : ""}`}
                                {" · "}
                                {timeLabel}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <InboxComposer conversationId={current.id} />
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center bg-[#EFEAE2] px-6">
                <MessageSquare
                  aria-hidden="true"
                  className="mb-4 h-16 w-16 text-gray-300"
                />
                <p className="mb-2 text-lg font-medium text-gray-600">No messages yet</p>
                <p className="text-sm text-gray-400">
                  This conversation doesn&apos;t have any messages
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Deterministic server-side formatting (no hydration mismatch). */
function safeFormatTime(iso: string, timezone: string): string {
  try {
    return formatInTimeZone(new Date(iso), timezone, "MMM d, HH:mm");
  } catch {
    return "";
  }
}

function safeFormatDate(iso: string, timezone: string): string | null {
  try {
    return formatInTimeZone(new Date(iso), timezone, "MMM d, yyyy");
  } catch {
    return null;
  }
}