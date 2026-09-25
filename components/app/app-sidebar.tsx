import { AppSidebarShell } from "@/components/app/app-sidebar-shell";
import { createClient } from "@/lib/supabase/server";

export async function AppSidebar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <AppSidebarShell userEmail={user?.email ?? null} />;
}
