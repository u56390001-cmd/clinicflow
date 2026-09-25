import type { SupabaseClient } from "@supabase/supabase-js";

import { CLINICAL_ROLES, CLINIC_WRITE_ROLES } from "@/lib/constants";
import type { ClinicRole, Database } from "@/types/database";

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
  };
};

/**
 * Resolve the clinic the signed-in user most recently joined (same "latest
 * membership" rule as the dashboard). Returns null when the user has no
 * clinic. `clinic` is null when the membership exists but its clinic row is
 * not readable (RLS) or was deleted.
 */
export async function getCurrentClinic(
  supabase: SupabaseClient<Database>,
): Promise<CurrentClinicAccess | null> {
  const { data: memberships } = await supabase
    .from("clinic_members")
    .select("role, clinics(id, name, slug, timezone, doctor_name, phone, email, address, google_review_url)")
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
    },
  };
}

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
