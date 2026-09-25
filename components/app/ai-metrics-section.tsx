import { Bot, CalendarClock, CheckCircle2, MessageSquare, ShieldAlert, XCircle } from "lucide-react";

import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { getAiMetrics } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";

/**
 * AI receptionist usage metrics (Phase 9 observability). Server-rendered from
 * `ai_conversation_logs`, scoped to the current clinic via RLS.
 */
export async function AiMetricsSection({ clinicId }: { clinicId: string }) {
  const supabase = await createClient();

  let metrics: Awaited<ReturnType<typeof getAiMetrics>> | null = null;
  try {
    metrics = await getAiMetrics(supabase, clinicId);
  } catch {
    metrics = null;
  }

  if (!metrics || metrics.sessions30d === 0) {
    return (
      <Card>
        <CardHeader>
          <p className="text-sm text-text-secondary">
            No AI conversations yet. Once visitors start chatting with your
            assistant on your website, session stats appear here.
          </p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section aria-label="AI receptionist activity" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Bot aria-hidden="true" className="h-5 w-5" />}
          label="Sessions"
          value={metrics.sessions30d}
          hint={`${formatRate(metrics.sessions30d === 0 ? null : Math.round((metrics.bookingAttempts30d / metrics.sessions30d) * 100))} attempted a booking`}
        />
        <StatCard
          icon={<CalendarClock aria-hidden="true" className="h-5 w-5" />}
          label="Booking attempts"
          value={metrics.bookingAttempts30d}
          hint={`${metrics.successful30d} booked successfully`}
        />
        <StatCard
          icon={
            <div className="flex items-center gap-1" aria-hidden="true">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <XCircle className="h-4 w-4 text-red-500" />
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            </div>
          }
          label="Outcomes"
          value={`${metrics.successful30d} / ${metrics.failed30d} / ${metrics.escalated30d}`}
          hint="Success / failed / escalated to staff"
        />
        <StatCard
          icon={<MessageSquare aria-hidden="true" className="h-5 w-5" />}
          label="Avg. messages"
          value={metrics.avgMessagesPerSession ?? "—"}
          hint="Per conversation"
        />
      </div>
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-dropdown">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-primary to-primary/60 transition-transform duration-300 group-hover:scale-x-100"
      />
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{label}</CardDescription>
          <div className="rounded-control bg-primary/10 p-2 text-primary transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/15">
            {icon}
          </div>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-text-primary">
          {value}
        </p>
        {hint ? <CardDescription>{hint}</CardDescription> : null}
      </CardHeader>
    </Card>
  );
}

function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${rate}%`;
}
