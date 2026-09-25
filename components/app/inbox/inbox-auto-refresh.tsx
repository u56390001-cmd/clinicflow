"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Lightweight near-real-time inbox: the server component re-renders on
 * `router.refresh()` so new WhatsApp messages appear without a manual reload.
 * (Polling now; Realtime upgrade later if needed.)
 */
export function InboxAutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    // `router.refresh()` re-renders the whole inbox server tree, so a hidden
    // tab kept paying for it (and hammering the DB) indefinitely. Pause while
    // hidden; refresh once when the tab comes back into view.
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      id ??= setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        router.refresh();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
