import type { SupabaseClient } from "@supabase/supabase-js";

import type { DoctorVitalsConfig } from "@/types/database";

/**
 * `doctor_id` → that doctor's vitals config. A `null` value means "this
 * doctor has no config row" (render every standard vital); a *missing* key
 * means "not preloaded", so callers keep their client-fetch fallback.
 */
export type DoctorVitalsConfigMap = Record<string, DoctorVitalsConfig | null>;

/**
 * Batch-load vitals configs on the server so the check-in / Add Vitals popup
 * can paint the doctor's exact field set on the first frame instead of
 * flashing a skeleton (or the wrong field count) while a per-doctor client
 * fetch resolves after the modal opens.
 *
 * Returns an empty map on error so callers silently fall back to
 * `getDoctorVitalsConfigAction`.
 */
export async function fetchVitalsConfigs(
  supabase: SupabaseClient,
  clinicId: string,
  doctorIds: (string | null | undefined)[],
): Promise<DoctorVitalsConfigMap> {
  const ids = [...new Set(doctorIds.filter((id): id is string => !!id))];
  const map: DoctorVitalsConfigMap = {};
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from("doctor_vitals_config")
    .select("*")
    .eq("clinic_id", clinicId)
    .in("doctor_id", ids);

  if (error) {
    console.error("[fetchVitalsConfigs] select failed", {
      clinicId,
      code: error.code,
      message: error.message,
    });
    return {};
  }

  const byDoctor = new Map(
    (data ?? []).map((row: { doctor_id: string }) => [
      row.doctor_id,
      row as unknown as DoctorVitalsConfig,
    ]),
  );
  for (const id of ids) {
    map[id] = byDoctor.get(id) ?? null;
  }
  return map;
}
