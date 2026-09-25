import { NextRequest, NextResponse } from "next/server";

import {
  generatePatientSummary,
  isPatientSummaryEnabled,
  MAX_SUMMARY_CHARS,
} from "@/lib/ai/patient-summary";
import { checkRateLimit, envInt } from "@/lib/ai/rate-limit";
import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { fetchPatientRecord } from "@/lib/patient-record";
import { createClient } from "@/lib/supabase/server";

/**
 * Generate (or re-generate) a patient's AI summary.
 *
 * POST, not GET, because it writes: the generated text is cached on
 * `patients.ai_summary` so the sidebar card can render from the database on
 * every subsequent page load without an LLM call. Per plan §1.4 / decision D4
 * generation happens only when a human clicks refresh, never on page load —
 * that is the difference between one model call per patient and one per view.
 *
 * The cache key is the visit count. A summary written after two visits is stale
 * once the third is recorded, and `ai_summary_visit_count` is what makes that
 * detectable without diffing the underlying record.
 */

/** Generation is slow and expensive; the window is an hour, not a minute. */
const WINDOW_MS = 60 * 60 * 1000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: patientId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401 },
    );
  }

  const access = await getCurrentClinic(supabase);
  if (!access) {
    return NextResponse.json(
      { ok: false, error: "No clinic for this account." },
      { status: 403 },
    );
  }

  // Same gate the patients page uses. A summary is a condensed clinical record,
  // so whoever can read the record decides who can read this.
  if (!canManageClinical(access.role)) {
    return NextResponse.json(
      { ok: false, error: "Your role can't generate patient summaries." },
      { status: 403 },
    );
  }

  const clinicId = access.clinic.id;

  // Clinic-scoped, so another clinic's patient is indistinguishable from one
  // that does not exist. `patient_directory` rather than `patients` because
  // `visit_count` is the cache key and only the view computes it.
  const { data: patient, error: patientError } = await supabase
    .from("patient_directory")
    .select(
      "id, age, date_of_birth, gender, blood_group, known_allergies, medical_conditions, ai_summary, ai_summary_generated_at, ai_summary_visit_count, visit_count",
    )
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .maybeSingle();

  if (patientError) {
    console.error("[patients/ai-summary] patient lookup failed", {
      clinicId,
      code: patientError.code,
      message: patientError.message,
    });
    return NextResponse.json(
      { ok: false, error: "Could not load that patient." },
      { status: 500 },
    );
  }
  if (!patient) {
    return NextResponse.json(
      { ok: false, error: "Patient not found." },
      { status: 404 },
    );
  }

  // Plan §1.4: with no consultation history there is nothing to summarise, and
  // the card shows fixed copy. Checked before the feature flag so the honest
  // answer is "no history yet" rather than "feature unavailable".
  if (patient.visit_count === 0) {
    return NextResponse.json({
      ok: true,
      summary: null,
      reason: "no-history",
    });
  }

  const force = request.nextUrl.searchParams.get("force") === "1";
  const cached = patient.ai_summary?.trim();
  const cacheValid =
    Boolean(cached) && patient.ai_summary_visit_count === patient.visit_count;

  if (cacheValid && !force) {
    return NextResponse.json({
      ok: true,
      summary: cached,
      generatedAt: patient.ai_summary_generated_at,
      reason: "cached",
    });
  }

  // Decision D4: built, but dark until the deployment opts in. Deliberately
  // after the cache check — a clinic that generated summaries before the flag
  // was turned off keeps reading what it already has, it just cannot make more.
  if (!isPatientSummaryEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "AI patient summaries are not enabled for this deployment. Contact your administrator.",
        code: "disabled",
      },
      { status: 503 },
    );
  }

  // Only generation is rate limited. Cached reads above are free, so a staff
  // member clicking through twenty patients never trips this.
  const limit = envInt("PATIENT_AI_SUMMARY_RATE_LIMIT", 20);
  const rate = checkRateLimit(`ai:summary:${user.id}`, limit, WINDOW_MS);
  if (!rate.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Too many summaries generated. Try again in ${Math.ceil(rate.retryAfterSeconds / 60)} minute(s).`,
        code: "rate-limited",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      },
    );
  }

  const record = await fetchPatientRecord(supabase, clinicId, patientId);

  // `visit_count` came from the view and the record from the tables. If the
  // record read back nothing there is no digest worth sending, whatever the
  // count says.
  if (record.visits.length === 0 && record.prescriptions.length === 0) {
    return NextResponse.json({
      ok: true,
      summary: null,
      reason: "no-history",
    });
  }

  const result = await generatePatientSummary(patient, record, clinicId);

  if (!result.ok) {
    const status = result.reason === "disabled" ? 503 : 502;
    return NextResponse.json(
      {
        ok: false,
        error:
          result.reason === "empty"
            ? "The model returned an empty summary. Please try again."
            : "Could not generate a summary right now. Please try again.",
        code: result.reason,
      },
      { status },
    );
  }

  const generatedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("patients")
    .update({
      ai_summary: result.summary.slice(0, MAX_SUMMARY_CHARS),
      ai_summary_generated_at: generatedAt,
      // Stamped with the count the summary was generated from, so the next
      // visit makes it detectably stale.
      ai_summary_visit_count: patient.visit_count,
    })
    .eq("clinic_id", clinicId)
    .eq("id", patientId);

  if (updateError) {
    // The summary is good, only the cache write failed. Return it rather than
    // throwing away a model call the clinic has already paid for; the next
    // refresh will try the write again.
    console.error("[patients/ai-summary] cache write failed", {
      clinicId,
      code: updateError.code,
      message: updateError.message,
    });
  }

  const response = NextResponse.json({
    ok: true,
    summary: result.summary,
    generatedAt,
    reason: "generated",
    cached: !updateError,
  });
  // Clinical content: no intermediary should hold a copy.
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
