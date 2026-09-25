"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants";

/**
 * Message icon in the top header — navigates straight to the full messages
 * dashboard (patient list on the left, WhatsApp inbox on the right).
 */
export function MessagesLink({ unreadCount }: { unreadCount: number }) {
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      title="Messages"
      className="relative"
    >
      <Link href={APP_ROUTES.app.inbox} aria-label="Messages">
        <MessageSquare aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 h-2 w-2 rounded-pill bg-status-destructive ring-2 ring-surface"
          />
        ) : null}
      </Link>
    </Button>
  );
}