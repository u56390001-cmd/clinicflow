import { NextResponse } from "next/server";

import { sendScheduledAssessmentInvite } from "@/lib/assessments/invite-delivery";
import { logAppEvent } from "@/lib/observability";
import { createWidgetClient } from "@/lib/supabase/widget";

/**
 * Assessment reminder cron (Phase 6) — sweeps due `assessment_schedule_rules`
 * and issues a fresh secure assessment invite over the clinic's WhatsApp
 * connection.
 *
 * Contract (mirrors the appointment-reminder cron):
 *   - Auth: `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret`).
 *   - Due rules: `active = true` AND `next_run_at <= now()`.
 *   - Idempotency: `next_run_at` / `last_run_at` / `last_link_id` advance only
 *     after a successful send, so transient failures retry on the next sweep.
 *   - Free-form WhatsApp needs Meta's open 24h window; failures are logged as
 *     app events and never crash the run.
 */

type DueRuleRow = {
  id: string;
  clinic_id: string;
  patient_id: string;
  assessment_type: string | null;
  template_id: string | null;
  cadence_days: number;
  created_by: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RULES_PER_SWEEP = 200;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

export async function POST(request: Request): Promise<Response> {
  return runAssessmentSweep(request);
}

/** Vercel Cron invokes endpoints with HTTP GET, so the scheduler path is GET too. */
export async function GET(request: Request): Promise<Response> {
  return runAssessmentSweep(request);
}

async function runAssessmentSweep(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createWidgetClient();
  const now = new Date();

  const { data, error } = await supabase
    .from("assessment_schedule_rules")
    .select(
      "id, clinic_id, patient_id, assessment_type, template_id, cadence_days, created_by",
    )
    .eq("active", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(MAX_RULES_PER_SWEEP);

  if (error) {
    console.error("[cron-assessment-reminders] query failed", error.message);
    return NextResponse.json({ ok: false, error: "Query failed." }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const raw of (data ?? []) as DueRuleRow[]) {
    if (!raw.created_by) {
      skipped += 1;
      continue;
    }
    try {
      const result = await sendScheduledAssessmentInvite({
        clinicId: raw.clinic_id,
        patientId: raw.patient_id,
        createdBy: raw.created_by,
        assessmentType: raw.assessment_type,
        templateId: raw.template_id,
      });

      if (!result.ok) {
        skipped += 1;
        await logAppEvent(supabase, {
          clinicId: raw.clinic_id,
          category: "email",
          event: "assessment_reminder_failed",
          severity: "warning",
          metadata: {
            ruleId: raw.id,
            patientId: raw.patient_id,
            reason: result.reason,
          },
        });
        continue;
      }

      sent += 1;
      const nextRunAt = new Date(
        now.getTime() + raw.cadence_days * DAY_MS,
      ).toISOString();
      await supabase
        .from("assessment_schedule_rules")
        .update({
          next_run_at: nextRunAt,
          last_run_at: now.toISOString(),
          last_link_id: result.linkId,
        })
        .eq("id", raw.id);
    } catch (sendError) {
      skipped += 1;
      await logAppEvent(supabase, {
        clinicId: raw.clinic_id,
        category: "email",
        event: "assessment_reminder_failed",
        severity: "warning",
        metadata: { ruleId: raw.id, patientId: raw.patient_id, reason: "exception" },
      });
      console.error("[cron-assessment-reminders] send threw", sendError);
    }
  }

  return NextResponse.json({
    ok: true,
    considered: data?.length ?? 0,
    sent,
    skipped,
  });
}
