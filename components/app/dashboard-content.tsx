import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { DashboardOverview } from "@/components/app/overview/dashboard-overview";
import { getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

export async function DashboardContent() {
  const supabase = await createClient();

  // Same "latest membership" lookup the header already performed this request;
  // going through the cached `getCurrentClinic` instead of an inline query
  // means the dashboard pays one round trip for both, not two.
  const access = await getCurrentClinic(supabase);

  if (!access) return <ClinicEmptyState />;

  return <DashboardOverview access={access} />;
}
