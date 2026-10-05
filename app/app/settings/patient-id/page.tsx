import { redirect } from "next/navigation";

import { PatientIdFormatCard } from "@/components/settings/patient-id-format-card";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import {
  clinicYear,
  coercePatientCodeFormat,
  DEFAULT_PATIENT_CODE_FORMAT,
  DEFAULT_PATIENT_CODE_PREFIX,
} from "@/lib/patient-code";
import { createClient } from "@/lib/supabase/server";
import type { PatientCodeFormat } from "@/types/database";

const FORMATS: PatientCodeFormat[] = ["sequence", "year_sequence"];

/**
 * Read the clinic's UHID format, tolerating a database that has not run
 * migration 0055 yet.
 *
 * Exactly the reasoning behind `readClinicLogoPath`: selecting a column that
 * does not exist fails PostgREST with `42703`, and folding that into the shared
 * `getCurrentClinic` select would break every authenticated page rather than
 * just this tab. Read in isolation, a failure degrades to the pre-0055
 * behaviour — which is also the correct answer for a clinic that never chose a
 * format.
 *
 * Lives here rather than in `lib/patient-code.ts` because that module is
 * imported by the client-side card and must stay free of server imports; this
 * read has exactly one consumer.
 */
async function readPatientCodeFormat(
  clinicId: string,
): Promise<PatientCodeFormat> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clinics")
    .select("patient_code_format")
    .eq("id", clinicId)
    .maybeSingle();

  if (error) {
    // Expected until 0055 is applied: 42703 (undefined column) or PGRST204
    // (column not in the schema cache).
    console.warn(
      "[readPatientCodeFormat] could not read clinics.patient_code_format",
      { code: error.code, message: error.message },
    );
    return DEFAULT_PATIENT_CODE_FORMAT;
  }

  const row = data as { patient_code_format?: unknown } | null;
  return coercePatientCodeFormat(row?.patient_code_format);
}

/**
 * Organization settings → Patient ID.
 *
 * Both format previews are computed up front — one RPC call per format — so the
 * card can show a live "next patient ID" for either choice with no round trip
 * when the owner toggles between them.
 *
 * Degradation is deliberate at each step, because 0055 may not be applied yet:
 *   * missing format column → `year_sequence`, the pre-0055 behaviour;
 *   * missing RPC → `null` from the call, and the card falls back to the
 *     format's example (`CLI-2026-00001`) rather than an empty badge.
 */
export default async function PatientIdSettingsPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) redirect("/app");

  const prefix =
    access.clinic.patient_code_prefix || DEFAULT_PATIENT_CODE_PREFIX;
  const format = await readPatientCodeFormat(access.clinic.id);

  // Called as `supabase.rpc(...)` on purpose. The client delegates to
  // `this.rest.rpc(...)`, so extracting the method first
  // (`const rpc = supabase.rpc`) drops `this` and throws
  // "Cannot read properties of undefined (reading 'rest')".
  const entries = await Promise.all(
    FORMATS.map(async (value) => {
      const { data, error } = await supabase.rpc("preview_next_patient_code", {
        p_clinic_id: access.clinic.id,
        p_prefix: prefix,
        p_format: value,
      });
      if (error) {
        // PGRST202 = function unknown to PostgREST, 42883 = wrong signature.
        // Either way the page still renders from the fallback shape.
        console.warn("[patient-id] preview_next_patient_code unavailable", {
          format: value,
          code: error.code,
          message: error.message,
        });
      }
      const preview = error || typeof data !== "string" ? null : data;
      return [value, preview] as const;
    }),
  );

  const previews = Object.fromEntries(entries) as Record<
    PatientCodeFormat,
    string | null
  >;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PatientIdFormatCard
        initialPrefix={prefix}
        initialFormat={coercePatientCodeFormat(format)}
        previews={{
          sequence: previews.sequence ?? "",
          year_sequence: previews.year_sequence ?? "",
        }}
        year={clinicYear(access.clinic.timezone)}
        canWrite={canWriteClinic(access.role)}
      />
    </div>
  );
}
