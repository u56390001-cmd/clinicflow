"use client";

import { Bell, Calendar, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { fetchHeaderNotifications } from "@/lib/header-activity";
import type { HeaderNotification } from "@/lib/header-activity";
import { relativeTimeAgo } from "@/lib/relative-time";
import { createClient } from "@/lib/supabase/client";

const SEEN_KEY = "medbook-header-notifications-seen-at";
const POLL_INTERVAL_MS = 20_000;

function readSeenAt(): number | null {
  if (typeof window === "undefined") return null;
  const value = Number(window.localStorage.getItem(SEEN_KEY));
  return Number.isNaN(value) ? null : value;
}

function keyOf(item: HeaderNotification): string {
  return `${item.kind}-${item.id}`;
}

function maxTimeOf(items: HeaderNotification[]): number {
  let max = 0;
  for (const item of items) {
    const time = new Date(item.createdAt).getTime();
    if (Number.isNaN(time)) continue;
    if (time > max) max = time;
  }
  return max;
}

/** Merge incoming items with the current list (dedupe, newest first). */
function mergeLists(
  current: HeaderNotification[],
  incoming: HeaderNotification[],
): HeaderNotification[] {
  const byKey = new Map<string, HeaderNotification>();
  for (const item of [...current, ...incoming]) {
    const existing = byKey.get(keyOf(item));
    if (!existing || item.createdAt > existing.createdAt) {
      byKey.set(keyOf(item), item);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 16);
}

/** Short two-tone chime for new arrivals (Web Audio, no asset file needed). */
let audioContext: AudioContext | null = null;

function playChime() {
  try {
    if (typeof window === "undefined") return;
    type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const contextClass = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!contextClass) return;
    audioContext ??= new contextClass();
    const now = audioContext.currentTime;
    const notes = [880, 1174.66]; // A5 -> D6
    notes.forEach((frequency, index) => {
      const oscillator = audioContext!.createOscillator();
      const gain = audioContext!.createGain();
      const start = now + index * 0.14;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      oscillator.connect(gain);
      gain.connect(audioContext!.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.45);
    });
  } catch {
    // Autoplay policies or unsupported browsers — stay silent.
  }
}

export function NotificationBell({
  notifications,
  clinicId,
}: {
  notifications: HeaderNotification[];
  clinicId?: string | null;
}) {
  const [list, setList] = useState<HeaderNotification[]>(notifications);
  const [seenAt, setSeenAt] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const newestRef = useRef<number>(maxTimeOf(notifications));
  const mountedRef = useRef(false);

  useEffect(() => {
    setSeenAt(readSeenAt());
  }, []);

  const receive = useCallback(
    (incoming: HeaderNotification[], playSound: boolean) => {
      const previousNewest = newestRef.current;
      const nextNewest = maxTimeOf(incoming);
      newestRef.current = Math.max(previousNewest, nextNewest);
      if (playSound && previousNewest > 0 && nextNewest > previousNewest) {
        playChime();
      }
      setList((current) => mergeLists(current, incoming));
    },
    [],
  );

  // Server-provided props refresh on navigation — seed silently once, then
  // ingest later updates (navigating to the inbox rings for anything new).
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      setList(notifications);
      newestRef.current = maxTimeOf(notifications);
      return;
    }
    receive(notifications, true);
  }, [notifications, receive]);

  const supabase = useMemo(() => (clinicId ? createClient() : null), [clinicId]);

  // Near-real-time arrival detection so the badge and chime stay live without
  // a manual reload (same polling approach as the inbox auto-refresh).
  useEffect(() => {
    if (!supabase || !clinicId) return;
    let cancelled = false;
    const poll = async () => {
      const items = await fetchHeaderNotifications(supabase, clinicId).catch(
        () => null,
      );
      if (!items || cancelled) return;
      receive(items, true);
    };
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [supabase, clinicId, receive]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const unseenCount =
    seenAt === null
      ? list.length
      : list.filter((n) => new Date(n.createdAt).getTime() > seenAt).length;

  const openPanel = () => {
    setOpen(true);
    const now = Date.now();
    setSeenAt(now);
    try {
      window.localStorage.setItem(SEEN_KEY, String(now));
    } catch {
      // Private mode etc. — the badge simply stays until the next reload.
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          open
            ? "Close notifications"
            : `Open notifications${unseenCount > 0 ? ` (${unseenCount} unread)` : ""}`
        }
        title={unseenCount > 0 ? `Notifications (${unseenCount} new)` : "Notifications"}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="relative"
      >
        <Bell aria-hidden="true" />
        {unseenCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-status-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface"
          >
            {unseenCount > 99 ? "99+" : unseenCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-80 max-h-[500px] overflow-hidden rounded-xl border border-text-muted/30 bg-surface shadow-dropdown"
        >
          <div className="sticky top-0 border-b border-text-muted/20 bg-surface px-4 py-3">
            <p className="text-sm font-semibold text-text-primary">Notifications</p>
          </div>

          {list.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-8 text-center">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-pill bg-primary/10">
                <Bell className="size-5 text-primary" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium text-text-primary">
                No notifications yet
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                You&rsquo;re all caught up.
              </p>
            </div>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto">
              {list.map((item) => (
                <li
                  key={keyOf(item)}
                  className="px-4 py-3 border-b border-text-muted/20 transition-colors last:border-b-0 hover:bg-app"
                >
                  <NotificationRow item={item} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow({ item }: { item: HeaderNotification }) {
  if (item.kind === "conversation") {
    return (
      <div className="flex gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-500">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-sm font-semibold text-text-primary">
            New conversation started
          </p>
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded bg-text-muted/20 px-2 py-0.5 text-xs font-semibold text-text-secondary">
              {item.patientName ?? item.phone}
            </span>
            <span className="text-xs text-text-muted">{item.phone}</span>
          </div>
          <p className="text-xs text-text-muted">{relativeTimeAgo(item.createdAt)}</p>
        </div>
      </div>
    );
  }

  const token = item.tokenNumber != null ? `Token #${item.tokenNumber}` : null;
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Calendar className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-sm font-semibold text-text-primary">
          New appointment booked
        </p>
        <p className="mb-1 text-xs text-text-secondary">
          {item.patientName} &middot; {item.serviceName}
          {token ? ` · ${token}` : null}
        </p>
        <p className="text-xs text-text-muted">{relativeTimeAgo(item.createdAt)}</p>
      </div>
    </div>
  );
}