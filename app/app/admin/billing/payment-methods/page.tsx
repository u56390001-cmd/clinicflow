import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AdminPaymentMethods } from "@/components/billing/admin-payment-methods";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payment methods" };

async function isPlatformAdmin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("platform_admins")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return !!data;
}

export default async function AdminPaymentMethodsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const admin = await isPlatformAdmin(supabase);
  if (!admin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Payment methods
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
          Payment methods
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Configure payment methods available to clinics.
        </p>
      </div>

      <AdminPaymentMethods />
    </div>
  );
}
