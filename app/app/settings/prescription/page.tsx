import { redirect } from "next/navigation";

import { PrescriptionSettingsCard } from "@/components/settings/prescription-settings-card";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

/**
 * Organization settings → Prescription.
 *
 * The header preference is read in isolation so a missing column from an
 * unapplied migration degrades gracefully: the card defaults to `true` (the
 * same as the column default and the current print behaviour) instead of making
 * the whole settings shell fail.
 */
async function readPrescriptionSettings(clinicId: string) {
  const defaults = {
    show_prescription_header: true,
  } as const;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clinics")
    .select("show_prescription_header")
    .eq("id", clinicId)
    .maybeSingle();

  if (error) {
    console.warn("[prescription-settings] could not read clinics column", {
      code: error.code,
      message: error.message,
    });
    return { ...defaults };
  }

  return {
    ...defaults,
    ...(data ?? {}),
  };
}

export default async function PrescriptionSettingsPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) redirect("/app");

  const settings = await readPrescriptionSettings(access.clinic.id);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PrescriptionSettingsCard
        initialShowHeader={settings.show_prescription_header}
        canWrite={canWriteClinic(access.role)}
      />
    </div>
  );
}
