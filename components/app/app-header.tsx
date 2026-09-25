import { AppHeaderShell } from "@/components/app/app-header-shell";
import { getSessionIdentity } from "@/lib/auth-session";
import { getCurrentClinic } from "@/lib/clinic-access";
import {
  fetchHeaderConversations,
  fetchHeaderNotifications,
} from "@/lib/header-activity";
import { createClient } from "@/lib/supabase/server";

export async function AppHeader() {
  const supabase = await createClient();
  // Identity and clinic resolve concurrently; both are request-cached now, so
  // the sidebar (same pass) and the page below reuse their results instead of
  // each paying for their own auth + membership round trips.
  const [session, access] = await Promise.all([
    getSessionIdentity(),
    getCurrentClinic(supabase),
  ]);

  const email = session?.email ?? null;
  const displayName = session?.fullName ?? null;

  const clinicId = access?.clinic.id ?? null;
  const [notifications, conversations] = clinicId
    ? await Promise.all([
        fetchHeaderNotifications(supabase, clinicId),
        fetchHeaderConversations(supabase, clinicId),
      ])
    : [[], []];

  return (
    <AppHeaderShell
      userEmail={email}
      userName={displayName}
      clinicId={access?.clinic.id ?? null}
      notifications={notifications}
      conversations={conversations}
    />
  );
}
