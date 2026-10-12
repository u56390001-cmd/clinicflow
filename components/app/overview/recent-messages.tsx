import Link from "next/link";
import { ChevronRight, MessageSquare } from "lucide-react";

import { QueueContactOpen } from "@/components/app/inbox/queue-contact-open";
import { OverviewPanel, PanelHeader } from "@/components/app/overview/overview-ui";
import { APP_ROUTES } from "@/lib/constants";
import { initialsOf, type InboxThread } from "@/lib/header-activity";
import { relativeTimeShort } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

/** Recent messages — the same merged thread feed the inbox uses, capped to 3. */
export function RecentMessages({ threads }: { threads: InboxThread[] }) {
  return (
    <OverviewPanel id="inboxPanel">
      <PanelHeader
        icon={MessageSquare}
        title="Recent messages"
        subtitle="Patient conversations in one place"
        action={
          <Link
            href={APP_ROUTES.app.inbox}
            className="whitespace-nowrap px-[6px] py-[6px] text-[11.5px] font-extrabold text-[var(--accent)] hover:underline"
          >
            Open inbox →
          </Link>
        }
      />

      {threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--pale)]">
            <MessageSquare aria-hidden="true" className="h-6 w-6 text-[var(--accent)]" />
          </div>
          <p className="mt-3 text-[12px] font-bold text-[var(--forest)]">
            No messages yet
          </p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
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
          "grid h-9 w-9 shrink-0 place-items-center rounded-[11px] text-[11px] font-extrabold transition-transform duration-200 group-hover:scale-105",
          warm
            ? "bg-[var(--overview-warm)] text-[var(--overview-warm-ink)]"
            : "bg-[var(--pale)] text-[var(--accent)]",
        )}
      >
        {initialsOf(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center justify-between gap-[10px]">
          <span className="min-w-0 truncate text-[11.5px] font-extrabold text-[var(--forest)]">
            {name}
            {thread.unread ? (
              <span className="ml-[5px] inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent)] align-middle" />
            ) : null}
          </span>
          <span className="whitespace-nowrap text-[10px] text-[var(--muted)]">
            {relativeTimeShort(thread.lastMessageAt)}
          </span>
        </span>
        <span className="mt-[3px] block truncate text-[11px] text-[var(--muted)]">
          {thread.preview ?? "No messages yet"}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="mt-[6px] h-4 w-4 shrink-0 text-[var(--muted)] opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
      />
    </>
  );

  const rowClass =
    "group flex items-start gap-[11px] border-t border-[color:var(--line)] py-[11px] text-left transition-colors first:border-t-0 hover:bg-[var(--surface)]";

  if (thread.queueVisitId) {
    return (
      <QueueContactOpen
        visitId={thread.queueVisitId}
        className="group !px-0 !py-[11px] hover:!bg-[var(--surface)]"
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
