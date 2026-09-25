"use server";

import { getCurrentClinic } from "@/lib/clinic-access";
import { escapeLikeSearchTerm } from "@/lib/patient-directory";
import { createClient } from "@/lib/supabase/server";

export type PatientQuickResult = {
  id: string;
  name: string;
  phone: string | null;
};

const MAX_QUERY_LENGTH = 120;
const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 6;

export async function searchPatientsAction(
  rawQuery: string,
): Promise<PatientQuickResult[]> {
  const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
  if (query.length < MIN_QUERY_LENGTH) return [];

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return [];

  // Same query contract as the patients directory page: RLS-scoped client,
  // explicit clinic filter, escaped ilike on name/email/phone.
  const term = escapeLikeSearchTerm(query);
  const { data, error } = await supabase
    .from("patient_directory")
    .select("id, name, phone")
    .eq("clinic_id", access.clinic.id)
    .or(`name.ilike.*${term}*,email.ilike.*${term}*,phone.ilike.*${term}*`)
    .order("name", { ascending: true, nullsFirst: false })
    .limit(RESULT_LIMIT);

  if (error) {
    console.error("[searchPatientsAction] patient_directory query failed", {
      code: error.code,
      message: error.message,
    });
    return [];
  }

  return data ?? [];
}
