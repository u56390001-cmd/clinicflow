import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { QueueContactOpen } from "@/components/app/inbox/queue-contact-open";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { initialsOf } from "@/lib/header-activity";
import type { InboxThread } from "@/lib/header-activity";
import { fetchInboxFeed } from "@/lib/inbox-query";
import { APP_ROUTES } from "@/lib/constants";
import { relativeTimeShort } from "@/lib/relative-time";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * Dashboard messages card (Phase 14) — same thread list as the inbox: recent
 * WhatsApp conversations plus patients currently in today's clinic queue.
 * Clicking a conversation opens the full inbox thread; clicking a queue
 * contact get-or-creates their conversation and opens it.
 */
export async function DashboardMessages({
  clinicId,
  limit = 6,
}: {
  clinicId: string;
  limit?: number;
}) {
  const supabase = await createClient();
  const feed = await fetchInboxFeed(supabase, clinicId);
  const threads = feed.threads.slice(0, limit);

  return (
    <Card className="h-full border border-border-light bg-white">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
            <MessageSquare aria-hidden="true" className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">Messages</h3>
            <p className="text-xs text-text-muted">WhatsApp + clinic queue</p>
          </div>
        </div>
        <Link
          href={APP_ROUTES.app.inbox}
          className="text-sm font-medium text-violet-600 transition-colors hover:text-violet-700"
        >
          Open inbox →
        </Link>
      </CardHeader>

      <CardContent className="pt-0">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <MessageSquare aria-hidden="true" className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="mt-4 text-sm font-medium text-text-secondary">
              No messages yet
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Chats and queue patients will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {threads.map((thread) => (
              <ThreadRow key={thread.id} thread={thread} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ThreadRow({ thread }: { thread: InboxThread }) {
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
          <span className="max-w-[180px] truncate text-gray-500" style={{ fontSize: "12px" }}>
            {thread.preview ?? "No messages yet"}
          </span>
          {thread.unread ? (
            <span
              className="ml-1.5 inline-flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full px-1 font-semibold text-white"
              style={{ backgroundColor: "rgb(29, 170, 97)", fontSize: "10px" }}
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
      <QueueContactOpen visitId={thread.queueVisitId} className="bg-white">
        {rowContent}
      </QueueContactOpen>
    );
  }

  return (
    <Link
      href={`${APP_ROUTES.app.inbox}?c=${thread.id}`}
      className={cn(
        "flex cursor-pointer items-center gap-3 bg-white px-4 py-[10px] transition-colors hover:bg-gray-50",
        thread.unread && "bg-[#F7FFF5] hover:bg-[#F7FFF5]",
      )}
    >
      {rowContent}
    </Link>
  );
}