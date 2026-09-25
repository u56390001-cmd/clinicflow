import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { APP_ROUTES } from "@/lib/constants";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side role gate for every billing route: staff members are not
 * allowed to access billing at all (Phase 9 permission enforcement).
 * Owner/admin proceed; users without a clinic fall through to each page's
 * own empty state.
 */
export default async function BillingLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (access && !canWriteClinic(access.role)) {
    redirect(APP_ROUTES.app.dashboard);
  }

  return <>{children}</>;
}
