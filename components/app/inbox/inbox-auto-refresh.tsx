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
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
