import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AdminRegistrationList } from "@/components/registrations/admin-registration-list";
import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin registrations" };

async function isPlatformAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return !!data;
}

/**
 * The approval queue for new clinic registrations. Approving a request is
 * what creates the account, the clinic and the subscription.
 */
export default async function AdminRegistrationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(APP_ROUTES.auth.login);
  }

  if (!(await isPlatformAdmin(supabase))) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Registration requests
          </h1>
        </div>
        <div className="rounded-card border border-text-muted/30 bg-surface p-8 text-center">
          <p className="text-sm text-text-secondary">
            Access denied. You don&apos;t have admin privileges.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          Registration requests
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Verify the payment for each request. Approving creates the account, the
          clinic and an active subscription, then emails the credentials.
        </p>
      </div>

      <AdminRegistrationList />
    </div>
  );
}
