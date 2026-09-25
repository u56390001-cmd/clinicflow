import { AppHeaderShell } from "@/components/app/app-header-shell";
import { getCurrentClinic } from "@/lib/clinic-access";
import {
  fetchHeaderConversations,
  fetchHeaderNotifications,
} from "@/lib/header-activity";
import { createClient } from "@/lib/supabase/server";

export async function AppHeader() {
  const supabase = await createClient();
  const [userResult, access] = await Promise.all([
    supabase.auth.getUser(),
    getCurrentClinic(supabase),
  ]);

  const user = userResult.data.user ?? null;
  const email = user?.email ?? null;
  const meta = (user?.user_metadata ?? null) as Record<string, unknown> | null;
  const metaName =
    typeof meta?.full_name === "string" && meta.full_name.trim()
      ? meta.full_name.trim()
      : typeof meta?.name === "string" && meta.name.trim()
        ? meta.name.trim()
        : null;
  const displayName = metaName ?? (email ? email.split("@")[0] : null);

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