import { AppSidebarShell } from "@/components/app/app-sidebar-shell";
import { getSessionIdentity } from "@/lib/auth-session";

export async function AppSidebar() {
  // Session identity comes from the cached local JWT claims (see
  // lib/auth-session.ts) — `auth.getUser()` here added a network round trip
  // to every navigation for nothing more than the account email.
  const session = await getSessionIdentity();

  return <AppSidebarShell userEmail={session?.email ?? null} />;
}
