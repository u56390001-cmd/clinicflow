import type { Metadata } from "next";

import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { ServicesManager } from "@/components/services/services-manager";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Services
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            What patients can book at your clinic.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  const [{ data: services }, { data: doctors }] = await Promise.all([
    supabase
      .from("services")
      .select("*")
      .eq("clinic_id", access.clinic.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("doctors")
      .select("*")
      .eq("clinic_id", access.clinic.id)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          Services
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {access.clinic.name} · /{access.clinic.slug}
        </p>
      </div>

      <ServicesManager
        initialServices={services ?? []}
        doctors={doctors ?? []}
        canWrite={canWriteClinic(access.role)}
      />
    </div>
  );
}
