import { OverviewHeader } from "@/components/app/overview/overview-header";
import { TodayFlowKpis } from "@/components/app/overview/today-flow-kpis";
import { MetricsRibbon } from "@/components/app/overview/metrics-ribbon";
import { TodaySchedule } from "@/components/app/overview/today-schedule";
import { QueueSnapshotPanel } from "@/components/app/overview/queue-snapshot";
import { RecentMessages } from "@/components/app/overview/recent-messages";
import { RecentActivity } from "@/components/app/overview/recent-activity";
import { Reveal } from "@/components/app/overview/motion";
import { type CurrentClinicAccess } from "@/lib/clinic-access";
import { loadDashboardOverview } from "@/lib/dashboard-overview";
import { getEntitlements } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";

const WORK_GRID =
  "grid gap-5 min-[1050px]:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]";

/**
 * The dashboard overview (right-side main content area). One server loader
 * gathers every tenant-scoped value; the components below are pure renders.
 * The `.medbook-dashboard-overview` wrapper scopes the concept's colour tokens
 * so nothing here can affect the sidebar, topbar or any other page.
 */
export async function DashboardOverview({
  access,
}: {
  access: CurrentClinicAccess;
}) {
  const supabase = await createClient();
  const [data, entitlements] = await Promise.all([
    loadDashboardOverview(supabase, access.clinic.id, access.clinic.timezone),
    getEntitlements(supabase, access.clinic.id),
  ]);

  return (
    <div className="medbook-dashboard-overview">
      <OverviewHeader
        clinicName={access.clinic.name}
        timezone={access.clinic.timezone}
      />

      <TodayFlowKpis
        appointmentsToday={data.kpis.appointmentsToday}
        patientsWaiting={data.kpis.patientsWaiting}
        inConsultation={data.kpis.inConsultation}
        completedVisits={data.kpis.completedVisits}
      />

      <MetricsRibbon
        newPatientsThisWeek={data.analytics.newPatientsThisWeek}
        aiBookingRate={data.analytics.aiBookingRate}
        websiteBookingRate={data.analytics.websiteBookingRate}
        cancellationRate={data.analytics.cancellationRate}
        showAiBooking={entitlements.features.includes("ai_receptionist")}
      />

      <Reveal delay={0.48} className={`${WORK_GRID} mb-5`}>
        <TodaySchedule rows={data.schedule} />
        <QueueSnapshotPanel queue={data.queue} />
      </Reveal>

      <Reveal delay={0.56} className={`${WORK_GRID} mt-5`}>
        <RecentMessages threads={data.messages} />
        <RecentActivity items={data.activity} />
      </Reveal>
    </div>
  );
}
