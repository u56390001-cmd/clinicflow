import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { QueueContactOpen } from "@/components/app/inbox/queue-contact-open";
import { OverviewPanel, PanelHeader } from "@/components/app/overview/overview-ui";
import { APP_ROUTES } from "@/lib/constants";
import { initialsOf } from "@/lib/header-activity";
import type { InboxThread } from "@/lib/header-activity";
import { relativeTimeShort } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

/** Recent messages — the same merged thread feed the inbox uses, capped to 3. */
export function RecentMessages({ threads }: { threads: InboxThread[] }) {
  return (
    <OverviewPanel>
      <PanelHeader
        icon={MessageSquare}
        title="Recent messages"
        subtitle="Patient conversations in one place"
        action={
          <Link
            href={APP_ROUTES.app.inbox}
            className="whitespace-nowrap px-1.5 py-1.5 text-[13px] font-semibold text-[var(--accent)] hover:underline"
          >
            Open inbox →
          </Link>
        }
      />

      {threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--pale)]">
            <MessageSquare aria-hidden="true" className="h-6 w-6 text-[var(--accent)]" />
          </div>
          <p className="mt-3 text-[15px] font-semibold text-[var(--forest)]">
            No messages yet
          </p>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Chats and queue patients will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1">
          {threads.map((thread, index) => (
            <MessageRow key={thread.id} thread={thread} warm={index % 2 === 1} />
          ))}
        </div>
      )}
    </OverviewPanel>
  );
}

function MessageRow({ thread, warm }: { thread: InboxThread; warm: boolean }) {
  const name = thread.patientName ?? thread.phone;

  const content = (
    <>
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold",
          warm
            ? "bg-[var(--overview-warm)] text-[var(--overview-warm-ink)]"
            : "bg-[var(--pale)] text-[var(--accent)]",
        )}
      >
        {initialsOf(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="min-w-0 truncate text-[14px] font-semibold text-[var(--forest)]">
            {name}
            {thread.unread ? (
              <span
                className="ml-1.5 inline-block h-2 w-2 rounded-full bg-[var(--accent)] align-middle"
                aria-hidden="true"
              />
            ) : null}
          </span>
          <span className="whitespace-nowrap text-[12px] text-[var(--muted)]">
            {relativeTimeShort(thread.lastMessageAt)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-[var(--muted)]">
          {thread.preview ?? "No messages yet"}
        </span>
      </span>
    </>
  );

  const rowClass =
    "group flex items-center gap-3 border-t border-[color:var(--line)] py-3 text-left transition-colors first:border-t-0 hover:bg-[var(--surface)]";

  if (thread.queueVisitId) {
    return (
      <QueueContactOpen
        visitId={thread.queueVisitId}
        className="group !px-0 !py-3 hover:!bg-[var(--surface)]"
      >
        {content}
      </QueueContactOpen>
    );
  }

  return (
    <Link href={`${APP_ROUTES.app.inbox}?c=${thread.id}`} className={rowClass}>
      {content}
    </Link>
  );
}
