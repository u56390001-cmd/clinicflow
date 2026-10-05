import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { CLINICAL_ROLES, CLINIC_WRITE_ROLES } from "@/lib/constants";
import type {
  AppointmentsViewMode,
  ClinicRole,
  Database,
} from "@/types/database";

export type CurrentClinicAccess = {
  role: ClinicRole;
  clinic: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    doctor_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    google_review_url: string | null;
    /**
     * Queue Management preference written by /app/integrations (migration
     * 0043). Included in the select above so the integrations dashboard and the
     * appointments page read the same column.
     */
    appointments_view_mode: AppointmentsViewMode;
    /**
     * UHID prefix, `not null default 'CLI'` since migration 0029 — safe to read
     * in the critical select above.
     *
     * `patient_code_format` (migration 0055) is deliberately NOT read here. A
     * column that does not exist yet makes PostgREST reject the whole nested
     * select, which fails the header, the dashboard and every other page at once
     * — the same "Set up your clinic" regression `logo_url` caused. The Patient
     * ID settings page reads it through its own tolerant query instead.
     */
    patient_code_prefix: string;
  };
};

/**
 * Resolve the clinic the signed-in user most recently joined (same "latest
 * membership" rule as the dashboard). Returns null when the user has no
 * clinic. `clinic` is null when the membership exists but its clinic row is
 * not readable (RLS) or was deleted.
 *
 * Memoized with React `cache()` — the header, the page, and any route layout
 * gating on a role all ask for the same clinic during one request, and without
 * this each of them paid for its own `clinic_members` round trip. Inside a
 * Server Action (no cache scope) it simply runs every time, as before.
 */
export const getCurrentClinic = cache(
  async (
    supabase: SupabaseClient<Database>,
  ): Promise<CurrentClinicAccess | null> => {
    const { data: memberships } = await supabase
      .from("clinic_members")
      .select(
        "role, clinics(id, name, slug, timezone, doctor_name, phone, email, address, google_review_url, appointments_view_mode, patient_code_prefix)",
      )
      .order("created_at", { ascending: false })
      .limit(1);

    const membership = memberships?.[0];
    const clinic = membership?.clinics ?? null;
    if (!membership || !clinic) return null;

    return {
      role: membership.role,
      clinic: {
        id: clinic.id,
        name: clinic.name,
        slug: clinic.slug,
        timezone: clinic.timezone,
        doctor_name: clinic.doctor_name,
        phone: clinic.phone,
        email: clinic.email,
        address: clinic.address,
        google_review_url: clinic.google_review_url,
        appointments_view_mode: clinic.appointments_view_mode,
        patient_code_prefix: clinic.patient_code_prefix,
      },
    };
  },
);

/** True when the role may write clinic data (owner/admin). Staff is read-only. */
export function canWriteClinic(role: ClinicRole): boolean {
  return (CLINIC_WRITE_ROLES as readonly string[]).includes(role);
}

/**
 * True when the role may manage the clinical floor (patients, appointments).
 * Every role qualifies in Phase 3 — the same guarantee the RLS policies
 * enforce (any member may read/write patients and appointments).
 */
export function canManageClinical(role: ClinicRole): boolean {
  return (CLINICAL_ROLES as readonly string[]).includes(role);
}

/**
 * True when the role may merge duplicate patient records.
 *
 * Every clinic member qualifies, exactly as the 0041 `merge_patient_profiles`
 * RPC enforces on its own (`is_clinic_member`) — so the UI gate, the server
 * action gate and the database gate can never disagree.
 *
 * Deliberately NOT `canWriteClinic` (owner/admin), which is what this started
 * as: front-desk staff are the ones who *create* the duplicates — a walk-in
 * booked from a fresh phone number, or a second profile typed in because the
 * search missed the first — and they are the ones standing at the counter the
 * moment the duplicate is discovered. Merging is non-destructive by
 * construction: 0041 re-parents every appointment, visit, prescription,
 * document, bill and WhatsApp thread and then soft-archives the duplicate, so
 * nothing is lost.
 */
export function canMergePatients(role: ClinicRole): boolean {
  return canManageClinical(role);
}
