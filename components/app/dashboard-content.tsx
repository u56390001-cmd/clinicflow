import { AnalyticsSection } from "@/components/app/analytics-section";
import { DashboardMessages } from "@/components/app/dashboard-messages";
import { DashboardUpcomingAppointments } from "@/components/app/dashboard-upcoming-appointments";
import { DashboardRecentActivity } from "@/components/app/dashboard-recent-activity";
import { DashboardQuickActions } from "@/components/app/dashboard-quick-actions";
import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

export async function DashboardContent() {
  const supabase = await createClient();

  // Same "latest membership" lookup the header already performed this request;
  // going through the cached `getCurrentClinic` instead of an inline query
  // means the dashboard pays one round trip for both, not two.
  const access = await getCurrentClinic(supabase);
  const clinic = access?.clinic ?? null;

  return (
    <div className="space-y-6">
      {!clinic ? (
        <ClinicEmptyState />
      ) : (
        <>
          {/* Section A — Greeting header */}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              Hey, {clinic.name}
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Here&apos;s what&apos;s happening at your organization today.
            </p>
          </div>

          {/* Section B — Analytics cards */}
          <AnalyticsSection clinicId={clinic.id} timezone={clinic.timezone} />

          {/* Section C — Clinic info block REMOVED (was: name/slug/timezone card) */}

          {/* Section D — Upcoming Appointments (paginated) */}
          <DashboardUpcomingAppointments
            clinicId={clinic.id}
            timezone={clinic.timezone}
          />

          {/* Section D2 — Messages (WhatsApp + today's queue) */}
          <DashboardMessages clinicId={clinic.id} />

          {/* Section E — Recent Activity + Quick Actions */}
          <div className="grid gap-6 lg:grid-cols-2">
            <DashboardRecentActivity clinicId={clinic.id} />
            <DashboardQuickActions
              clinicId={clinic.id}
              googleReviewUrl={clinic.google_review_url}
            />
          </div>
        </>
      )}
    </div>
  );
}


