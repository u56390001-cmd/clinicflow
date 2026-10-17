"use server";

import { getCurrentClinic } from "@/lib/clinic-access";
import { escapeLikeSearchTerm } from "@/lib/patient-directory";
import { createClient } from "@/lib/supabase/server";
import type { TerminologyCodeSystem, TerminologyHit } from "@/types/database";
import type { ActionResult } from "@/types";

const MAX_QUERY_LENGTH = 80;
const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 20;

/**
 * Search the coded terminology catalog (migration 0101) for a diagnosis field.
 *
 * Read-only reference data: any clinic member may search (RLS `select` is
 * `is_clinic_member`), so the guard is only `getCurrentClinic` — not
 * `canManageClinical` — matching the RLS policy exactly, the way the UI gate,
 * the server action gate and the database gate never disagree elsewhere.
 *
 * Query contract: a single `ilike` on the trigger-maintained `search_text`
 * haystack (code + display + category + synonyms, lowercased). Deliberately
 * NOT `.or(...)` — a comma or parenthesis typed into the search box would be
 * parsed by PostgREST as filter syntax, so those characters are stripped
 * before the escaped ilike pattern is built.
 */
export async function searchTerminologyAction(
  rawQuery: string,
  system?: TerminologyCodeSystem,
): Promise<ActionResult<TerminologyHit[]>> {
  const query = rawQuery
    .replace(/[,()"]/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
  if (query.length < MIN_QUERY_LENGTH) return { ok: true, data: [] };

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return { ok: true, data: [] };

  const term = escapeLikeSearchTerm(query);
  let builder = supabase
    .from("terminology_codes")
    .select("code, code_system, display, category")
    .eq("is_active", true)
    .ilike("search_text", `*${term}*`)
    .order("code", { ascending: true })
    .limit(RESULT_LIMIT);
  if (system) builder = builder.eq("code_system", system);

  const { data, error } = await builder;

  if (error) {
    console.error("[searchTerminologyAction] terminology_codes query failed", {
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      message: "Terminology search is unavailable right now.",
    };
  }

  return { ok: true, data: data ?? [] };
}
