import { Clock, Mail, CalendarCheck, ShieldAlert, Plug, Receipt } from "lucide-react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { AppEventCategory } from "@/types/database";

const EVENT_ICONS: Record<AppEventCategory, React.ReactNode> = {
  booking: <CalendarCheck aria-hidden="true" className="h-4 w-4 text-emerald-600" />,
  email: <Mail aria-hidden="true" className="h-4 w-4 text-blue-600" />,
  auth: <ShieldAlert aria-hidden="true" className="h-4 w-4 text-amber-600" />,
  api: <Plug aria-hidden="true" className="h-4 w-4 text-slate-500" />,
  billing: <Receipt aria-hidden="true" className="h-4 w-4 text-violet-600" />,
};

const EVENT_LABELS: Record<string, string> = {
  booking_created: "New booking",
  booking_cancelled: "Booking cancelled",
  booking_completed: "Booking completed",
  email_send_failed: "Email delivery failed",
  auth_login_failed: "Login failed",
  slot_conflict: "Slot conflict detected",
  bill_waived: "Bill waived",
  bill_cancelled: "Bill cancelled",
};

function formatEventLabel(event: string): string {
  if (EVENT_LABELS[event]) return EVENT_LABELS[event];
  return event
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export async function DashboardRecentActivity({
  clinicId,
}: {
  clinicId: string;
}) {
  const supabase = await createClient();

  let events: {
    id: string;
    category: AppEventCategory;
    event: string;
    severity: string;
    created_at: string;
  }[] | null = null;

  try {
    const result = await supabase
      .from("app_event_logs")
      .select("id, category, event, severity, created_at")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(8);

    events = result.data;
  } catch {
    events = null;
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>

        {!events || events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Clock
              aria-hidden="true"
              className="mb-3 h-12 w-12 text-text-muted/40"
            />
            <p className="text-base font-medium text-text-secondary">
              No recent activity
            </p>
            <p className="mt-1 text-sm text-text-muted">
              Events will appear here as they happen.
            </p>
          </div>
        ) : (
          <div className="mt-2 divide-y divide-border-light">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="mt-0.5 shrink-0 rounded-md bg-background p-1.5">
                  {EVENT_ICONS[ev.category]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    {formatEventLabel(ev.event)}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {timeAgo(ev.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardHeader>
    </Card>
  );
}
