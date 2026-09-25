import {
  Activity,
  CalendarCheck,
  CalendarDays,
  Percent,
  Sparkles,
  TrendingUp,
  UserPlus,
} from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getClinicAnalytics } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";

type AnalyticsData = Awaited<ReturnType<typeof getClinicAnalytics>>;

/**
 * Live clinic analytics (PRD "Dashboard metrics"). Server-rendered from real
 * rows — every query is scoped to the current clinic and RLS-checked.
 */
export async function AnalyticsSection({ clinicId, timezone }: { clinicId: string; timezone: string }) {
  const supabase = await createClient();

  let analytics: AnalyticsData | null = null;
  try {
    analytics = await getClinicAnalytics(supabase, clinicId, timezone);
  } catch {
    analytics = null;
  }

  if (!analytics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analytics</CardTitle>
          <p className="text-sm text-red-600">
            We couldn&apos;t load your analytics. Please refresh the page to try again.
          </p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section aria-label="Clinic analytics" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CalendarDays aria-hidden="true" className="h-5 w-5 text-white" />}
          iconBg="bg-emerald-500"
          label="Appointments today"
          value={analytics.appointmentsToday}
        />
        <StatCard
          icon={<CalendarCheck aria-hidden="true" className="h-5 w-5 text-white" />}
          iconBg="bg-blue-500"
          label="This week"
          value={analytics.appointmentsThisWeek}
        />
        <StatCard
          icon={<UserPlus aria-hidden="true" className="h-5 w-5 text-white" />}
          iconBg="bg-violet-500"
          label="New patients this week"
          value={analytics.newPatientsThisWeek}
          hint={`${analytics.newPatientsThisMonth} this month`}
        />
        <StatCard
          icon={<Percent aria-hidden="true" className="h-5 w-5 text-white" />}
          iconBg="bg-amber-500"
          label="Cancellation rate"
          value={formatRate(analytics.cancellationRate)}
          hint="Last 30 days"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Activity aria-hidden="true" className="h-5 w-5 text-white" />}
          iconBg="bg-red-500"
          label="No-show rate"
          value={formatRate(analytics.noShowRate)}
          hint="Last 30 days"
        />
        <StatCard
          icon={<Sparkles aria-hidden="true" className="h-5 w-5 text-white" />}
          iconBg="bg-primary"
          label="AI booking rate"
          value={formatRate(analytics.aiBookingRate)}
          hint="Booked by your AI receptionist · last 30 days"
        />
        <StatCard
          icon={<TrendingUp aria-hidden="true" className="h-5 w-5 text-white" />}
          iconBg="bg-teal-500"
          label="Website booking rate"
          value={formatRate(analytics.websiteBookingRate)}
          hint="Booked via your website widget · last 30 days"
        />
        <Card>
          <CardHeader className="justify-center">
            <CardDescription>Bookings trend</CardDescription>
            <TrendBars trend={analytics.trend} />
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </section>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card className="transition-shadow hover:shadow-cardHover">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-text-secondary">{label}</p>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            {icon}
          </div>
        </div>
        <p className="pt-1 text-[28px] font-bold leading-tight tracking-tight text-text-primary">
          {value}
        </p>
        {hint ? (
          <p className="text-xs text-text-tertiary">{hint}</p>
        ) : null}
      </CardHeader>
    </Card>
  );
}

function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${rate}%`;
}

function TrendBars({ trend }: { trend: AnalyticsData["trend"] }) {
  const max = Math.max(1, ...trend.map((point) => point.count));
  const total = trend.reduce((sum, point) => sum + point.count, 0);

  if (total === 0) {
    return (
      <p className="py-2 text-sm text-text-secondary">
        No appointments in the last 30 days.
      </p>
    );
  }

  return (
    <div className="flex h-16 items-end gap-[3px]" role="img" aria-label={`Appointments per day over the last 30 days, ${total} total`}>
      {trend.map((point) => (
        <div
          key={point.date}
          title={`${point.date}: ${point.count}`}
          className={
            point.count === 0
              ? "w-full rounded-t-sm bg-text-muted/20"
              : "w-full rounded-t-sm bg-primary/80"
          }
          style={{ height: `${Math.max(6, (point.count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
