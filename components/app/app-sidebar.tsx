import { AppSidebarShell } from "@/components/app/app-sidebar-shell";
import { getCurrentClinic } from "@/lib/clinic-access";
import { DEFAULT_ROLE_PERMISSIONS, type Permission } from "@/lib/auth/rbac-config";
import { getSessionIdentity } from "@/lib/auth-session";
import { APP_NAV_SECTIONS, APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ClinicRole } from "@/types/database";

/**
 * Roles that keep the full navigation. `owner`/`admin`/`clinic_admin` are the
 * admin tier; `staff` (Phase-1 legacy) is intentionally left unfiltered so
 * existing users see no change. Only the new granular roles are narrowed.
 */
const FULL_NAV_ROLES: readonly ClinicRole[] = [
  "owner",
  "admin",
  "clinic_admin",
  "staff",
];

/**
 * Nav destinations that require a permission. Anything absent here (Dashboard,
 * Help & Support) is always shown.
 */
const NAV_ITEM_PERMISSIONS: Record<string, Permission> = {
  [APP_ROUTES.app.appointments]: "appointments:read",
  [APP_ROUTES.app.calendar]: "appointments:read",
  [APP_ROUTES.app.inbox]: "appointments:read",
  [APP_ROUTES.app.patients]: "patients:read",
  [APP_ROUTES.app.patientBilling]: "billing:read",
  [APP_ROUTES.app.doctors]: "staff:manage",
  [APP_ROUTES.app.aiSettings]: "settings:manage",
  [APP_ROUTES.app.website]: "settings:manage",
  [APP_ROUTES.app.bookingPage]: "settings:manage",
  [APP_ROUTES.app.growthAgent]: "settings:manage",
  [APP_ROUTES.app.engagement]: "settings:manage",
  [APP_ROUTES.app.integrations]: "settings:manage",
  [APP_ROUTES.app.addons]: "settings:manage",
  [APP_ROUTES.app.whatsapp]: "settings:manage",
  [APP_ROUTES.app.billing]: "billing:read",
  [APP_ROUTES.app.settings]: "settings:manage",
};

type NavSection = {
  label: string;
  items: ReadonlyArray<{ label: string; href: string }>;
};

function filterSectionsForRole(role: ClinicRole | null): readonly NavSection[] {
  if (!role || FULL_NAV_ROLES.includes(role)) {
    return APP_NAV_SECTIONS.map((section) => ({
      label: section.label,
      items: section.items.map((item) => ({ label: item.label, href: item.href })),
    }));
  }

  const allowed = new Set<Permission>(DEFAULT_ROLE_PERMISSIONS[role] ?? []);

  return APP_NAV_SECTIONS.map((section) => ({
    label: section.label,
    items: section.items
      .map((item) => ({ label: item.label, href: item.href }))
      .filter((item) => {
        const required = NAV_ITEM_PERMISSIONS[item.href];
        return !required || allowed.has(required);
      }),
  })).filter((section) => section.items.length > 0);
}

export async function AppSidebar() {
  // Session identity comes from the cached local JWT claims (see
  // lib/auth-session.ts) — `auth.getUser()` here added a network round trip
  // to every navigation for nothing more than the account email.
  const session = await getSessionIdentity();

  // Role drives nav visibility. `getCurrentClinic` is React-`cache`d, so the
  // header/page have already paid for this query in the same request.
  let role: ClinicRole | null = null;
  try {
    const supabase = await createClient();
    role = (await getCurrentClinic(supabase))?.role ?? null;
  } catch {
    role = null;
  }

  return (
    <AppSidebarShell
      userEmail={session?.email ?? null}
      sections={filterSectionsForRole(role)}
    />
  );
}
