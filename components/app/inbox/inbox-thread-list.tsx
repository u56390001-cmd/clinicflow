"use client";

import Link from "next/link";
import { MessageSquare, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { QueueContactOpen } from "@/components/app/inbox/queue-contact-open";
import { initialsOf } from "@/lib/header-activity";
import type { InboxThread } from "@/lib/header-activity";
import { relativeTimeShort } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

type FilterId = "all" | "unread" | "today" | "week";

const FILTERS: { id: FilterId; label: string; mobileLabel: string }[] = [
  { id: "all", label: "All", mobileLabel: "All" },
  { id: "unread", label: "Unread", mobileLabel: "Unread" },
  { id: "today", label: "Today", mobileLabel: "Today" },
  { id: "week", label: "Week", mobileLabel: "This Week" },
];

/**
 * Messages dashboard left column — header, All/Unread/Today/Week filter pills,
 * search, and the conversation list. Mirrors the reference "messaeg html css"
 * design exactly (white surfaces, gray borders, indigo avatars, green accents).
 */
export function InboxThreadList({
  threads,
  activeId,
  unreadCount,
}: {
  threads: InboxThread[];
  activeId: string | null;
  unreadCount: number;
}) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");

  const visibleThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const weekAgo = Date.now() - 7 * 86_400_000;

    return threads.filter((thread) => {
      const at = new Date(thread.lastMessageAt).getTime();

      if (filter === "unread" && !thread.unread) return false;
      if (filter === "today" && (Number.isNaN(at) || at < startOfToday.getTime())) {
        return false;
      }
      if (filter === "week" && (Number.isNaN(at) || at < weekAgo)) return false;
      if (q) {
        const name = (thread.patientName ?? "").toLowerCase();
        if (!name.includes(q) && !thread.phone.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [threads, filter, query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Filters + search */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 pb-3 pt-3">
        {/* Desktop segmented pills */}
        <div className="mb-3 hidden gap-1 rounded-lg bg-gray-100 p-1 md:flex">
          {FILTERS.map((tab) => {
            const isActive = filter === tab.id;
            const activeClass =
              "flex-1 rounded-md bg-white py-1.5 text-xs font-medium text-gray-900 shadow-sm transition-all";
            const idleClass =
              "flex-1 rounded-md py-1.5 text-xs font-medium text-gray-600 transition-all hover:text-gray-900";
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                aria-pressed={isActive}
                className={cn(
                  isActive ? activeClass : idleClass,
                  "flex items-center justify-center gap-1",
                )}
              >
                {tab.label}
                {tab.id === "unread" && unreadCount > 0 ? (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-xs text-white"
                    style={{ backgroundColor: "rgb(78, 93, 181)" }}
                  >
                    {unreadCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Mobile pills */}
        <div
          className="mb-3 flex w-full gap-2 overflow-x-auto pb-1 md:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {FILTERS.map((tab) => {
            const isActive = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium transition-all"
                style={{
                  padding: "5px 14px",
                  borderRadius: "20px",
                  backgroundColor: isActive ? "rgb(217, 253, 211)" : "rgb(240, 242, 245)",
                  color: isActive ? "rgb(26, 122, 74)" : "rgb(85, 85, 85)",
                  border: isActive ? "1px solid rgb(195, 240, 184)" : "1px solid transparent",
                }}
              >
                {tab.mobileLabel}
                {tab.id === "unread" && unreadCount > 0 ? (
                  <span
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white"
                    style={{ backgroundColor: "rgb(29, 170, 97)" }}
                  >
                    {unreadCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            aria-label="Search conversations"
            className="w-full rounded-[20px] border-none bg-[#F0F2F5] py-2 pl-9 pr-4 text-[13px] text-[#333333] outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
        {visibleThreads.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
              <MessageSquare className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-gray-600">No conversations</p>
            <p className="mt-1 text-sm text-gray-400">
              {query.trim() || filter !== "all"
                ? "Try a different search or filter."
                : "Chats will appear here when patients message you."}
            </p>
          </div>
        ) : (
          visibleThreads.map((thread) => {
            const isActive = thread.id === activeId;
            const name = thread.patientName ?? thread.phone;
            const rowContent = (
              <>
                <span
                  className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-full font-semibold text-white"
                  style={{ fontSize: "15px", backgroundColor: "#0D9488" }}
                >
                  {initialsOf(name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-0.5 flex items-center justify-between">
                    <span className="truncate font-semibold text-gray-900" style={{ fontSize: "14px" }}>
                      {name}
                    </span>
                    <span
                      className="ml-1.5 flex-shrink-0"
                      style={{
                        fontSize: "11px",
                        color: thread.unread ? "rgb(29, 170, 97)" : "rgb(154, 154, 154)",
                      }}
                    >
                      {relativeTimeShort(thread.lastMessageAt)}
                    </span>
                  </span>
                  <span className="flex items-center justify-between">
                    <span
                      className="max-w-[180px] truncate text-gray-500"
                      style={{ fontSize: "12px" }}
                    >
                      {thread.preview ?? "No messages yet"}
                    </span>
                    {thread.unread ? (
                      <span
                        className="ml-1.5 inline-flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full px-1 font-semibold text-white"
                        style={{
                          backgroundColor: "rgb(29, 170, 97)",
                          fontSize: "10px",
                        }}
                      >
                        1
                      </span>
                    ) : null}
                  </span>
                </span>
              </>
            );

            if (thread.queueVisitId) {
              return (
                <QueueContactOpen key={thread.id} visitId={thread.queueVisitId}>
                  {rowContent}
                </QueueContactOpen>
              );
            }

            return (
              <Link
                key={thread.id}
                href={`/app/inbox?c=${thread.id}`}
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-4 py-[10px] transition-colors hover:bg-gray-50",
                  isActive ? "bg-gray-50" : thread.unread ? "bg-[#F7FFF5]" : "bg-white",
                )}
              >
                {rowContent}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}