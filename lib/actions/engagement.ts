"use server";

/**
 * Patient Engagement & Automation server actions (migration 0062).
 *
 * Owns the read model for the /app/engagement page and every write it makes:
 * automation toggles, message templates, general settings, and logging a
 * Google review. Follows the addons/integrations security shape:
 *
 *   1. Resolve the clinic from the signed-in user's own membership.
 *   2. Check the role — `canWriteClinic` for anything that changes state.
 *   3. Validate the input with Zod.
 *
 * No action accepts a `clinicId` from the client; RLS is the backstop, not the
 * primary control.
 *
 * ## Defaults
 *
 * A clinic's row set is seeded lazily — the first snapshot read upserts the
 * full template + automation catalogue with the design's default copy, so a
 * fresh clinic opens the page with everything sensible and on.
 *
 * ## The reminder seam
 *
 * `engagementLogMessage` is the writer the appointment-reminder cron uses; the
 * engine inside the cron reads this table's `appointment_reminder` row for its
 * window + template. Nothing else writes `engagement_logs` (RLS blocks it).
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canWriteClinic,
  getCurrentClinic,
  type CurrentClinicAccess,
} from "@/lib/clinic-access";
import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";
import type { Database } from "@/types/database";
import { z } from "zod";
import {
  addClinicReviewSchema,
  engagementAutomationSchema,
  engagementGeneralSettingsSchema,
  engagementReminderFormSchema,
  engagementTemplateSchema,
  ENGAGEMENT_AUTOMATION_TYPES,
  ENGAGEMENT_TEMPLATE_TYPES,
  type EngagementAutomationInput,
  type EngagementReminderFormInput,
  type EngagementTemplateInput,
} from "@/lib/validation/schemas";

const ENGAGEMENT_PATH = APP_ROUTES.app.engagement;

type EngagementAuth =
  | {
      ok: true;
      supabase: SupabaseClient<Database>;
      access: CurrentClinicAccess;
    }
  | { ok: false; message: string };

/** Resolve clinic + assert read access. Every clinic member may view. */
async function requireEngagementRead(): Promise<EngagementAuth> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You need a clinic before you can view engagement settings.",
    };
  }
  return { ok: true, supabase, access };
}

/** Resolve clinic + assert write access. Only owners/admins change config. */
async function requireEngagementWrite(): Promise<EngagementAuth> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You need a clinic before you can change engagement settings.",
    };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can change engagement settings.",
    };
  }
  return { ok: true, supabase, access };
}

// ---------------------------------------------------------------------------
// Catalogue — the seed copy and automation presets (matches the design doc)
// ---------------------------------------------------------------------------

export type EngagementTemplateView = {
  templateText: string;
  enabled: boolean;
};

export type EngagementAutomationView = {
  enabled: boolean;
  config: Record<string, unknown>;
};

const TEMPLATE_DEFAULTS: Record<
  (typeof ENGAGEMENT_TEMPLATE_TYPES)[number],
  string
> = {
  appointment_confirmation:
    "Hi {patient_name}! Your appointment with {doctor_name} at {clinic_name} is confirmed for {appointment_date} at {appointment_time}. 📅 See you soon! Reply with any questions. {clinic_location}",
  appointment_reminder:
    "Hi {patient_name}! A friendly reminder about your appointment with {doctor_name} at {clinic_name} on {appointment_date} at {appointment_time}. ⏰ We look forward to seeing you! {clinic_location}",
  review_request:
    "Hi {patient_name}! We hope you had a smooth appointment with {doctor_name} at {clinic_name}. 😊 We'd love your feedback — it takes less than a minute to leave a Google review and it helps us serve you better. 🌟 Thank you!\n\n{clinic_name}\n{clinic_location}",
  prescription_delivery:
    "Hi {patient_name}, your prescription from {clinic_name} is ready. 📋 Here is your digital prescription from {doctor_name}. Take care!",
  receipt_delivery:
    "Hi {patient_name}, thank you for your payment at {clinic_name}. 🧾 Your receipt is attached below.",
  check_in:
    "Hi {patient_name}! You're checked in at {clinic_name}. 🚶 We'll call you as soon as {doctor_name} is ready. Estimated wait: ~{wait_time}.",
  no_show_recovery:
    "Hi {patient_name}, we missed you at {clinic_name} today. 💙 We understand life gets busy — would you like to reschedule your appointment with {doctor_name}? Reply YES to pick a new time.",
  auto_follow_up:
    "Hi {patient_name}! Hope you're recovering well after your visit with {doctor_name}. 💙 Reply with any concerns or to schedule a follow-up.",
};

const AUTOMATION_DEFAULTS: Record<
  (typeof ENGAGEMENT_AUTOMATION_TYPES)[number],
  { enabled: boolean; config: Record<string, unknown> }
> = {
  appointment_reminder: { enabled: true, config: { delay_hours: 24 } },
  appointment_confirmation: { enabled: true, config: {} },
  review_request: { enabled: true, config: { delay_hours: 24 } },
  prescription_delivery: { enabled: true, config: {} },
  receipt_delivery: { enabled: true, config: {} },
  check_in: { enabled: true, config: {} },
  no_show_recovery: { enabled: true, config: { delay_hours: 24 } },
  auto_follow_up: { enabled: true, config: { days_after: 3 } },
  general: { enabled: true, config: { maps_link: "" } },
};

/**
 * Seeds the catalogue for a clinic on first visit. Delegates to a SECURITY
 * DEFINER helper so any member reading the page can trigger it (staff don't
 * have RLS write access to these tables). The function is idempotent:
 * `on conflict do nothing` keeps existing custom copy untouched on re-runs.
 */
async function ensureEngagementDefaults(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<boolean> {
  const { error } = await supabase.rpc("ensure_engagement_defaults", {
    p_clinic_id: clinicId,
  });
  return !error;
}

// ---------------------------------------------------------------------------
// 1. getEngagementSnapshotAction — the page read model
// ---------------------------------------------------------------------------

export type EngagementSnapshot = {
  clinicId: string;
  clinicName: string;
  canWrite: boolean;
  whatsappConnected: boolean;
  receiptAutoSend: boolean;
  timezone: string;
  reviewUrl: string;
  /** Members of the accessing clinic — used for the "Specific Doctor" scope. */
  doctors: { id: string; name: string }[];
  templates: Partial<
    Record<(typeof ENGAGEMENT_TEMPLATE_TYPES)[number], EngagementTemplateView>
  >;
  automations: Partial<
    Record<(typeof ENGAGEMENT_AUTOMATION_TYPES)[number], EngagementAutomationView>
  >;
  metrics: {
    remindersSent: number;
    completed: number;
    noShowCount: number;
    showUpRate: number;
    reviewsCount: number;
    averageRating: number | null;
  };
};

export async function getEngagementSnapshotAction(): Promise<
  ActionResult<EngagementSnapshot>
> {
  const auth = await requireEngagementRead();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  // Best-effort seed: even if it fails (helper should not), the in-memory
  // catalog below keeps the page renderable for the first visit.
  await ensureEngagementDefaults(supabase, clinicId);

  const [clinicResult, templatesResult, automationsResult, doctorsResult] =
    await Promise.all([
      supabase
        .from("clinics")
        .select("name, timezone, google_review_url, auto_send_whatsapp_receipt")
        .eq("id", clinicId)
        .maybeSingle(),
      supabase
        .from("engagement_templates")
        .select("type, template_text, enabled")
        .eq("clinic_id", clinicId),
      supabase
        .from("engagement_automations")
        .select("automation_type, enabled, config")
        .eq("clinic_id", clinicId),
      supabase
        .from("doctors")
        .select("id, name")
        .eq("clinic_id", clinicId)
        .order("name", { ascending: true }),
    ]);

  if (
    clinicResult.error ||
    templatesResult.error ||
    automationsResult.error ||
    doctorsResult.error
  ) {
    return { ok: false, message: "Could not load engagement settings." };
  }

  const clinic = clinicResult.data;
  const templates: Partial<
    Record<(typeof ENGAGEMENT_TEMPLATE_TYPES)[number], EngagementTemplateView>
  > = {};
  for (const type of ENGAGEMENT_TEMPLATE_TYPES) {
    templates[type] = {
      templateText: TEMPLATE_DEFAULTS[type],
      enabled: true,
    };
  }
  for (const row of templatesResult.data ?? []) {
    templates[row.type as (typeof ENGAGEMENT_TEMPLATE_TYPES)[number]] = {
      templateText: row.template_text,
      enabled: row.enabled,
    };
  }

  const automations: Partial<
    Record<(typeof ENGAGEMENT_AUTOMATION_TYPES)[number], EngagementAutomationView>
  > = {};
  for (const type of ENGAGEMENT_AUTOMATION_TYPES) {
    const preset = AUTOMATION_DEFAULTS[type];
    automations[type] = { enabled: preset.enabled, config: preset.config };
  }
  for (const row of automationsResult.data ?? []) {
    automations[row.automation_type as (typeof ENGAGEMENT_AUTOMATION_TYPES)[number]] = {
      enabled: row.enabled,
      config: (row.config ?? {}) as Record<string, unknown>,
    };
  }

  const [logsResult, reviewsResult, appointmentsResult, whatsappResult] =
    await Promise.all([
      supabase
        .from("engagement_logs")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("automation_type", "appointment_reminder")
        .eq("message_status", "sent"),
      supabase.from("clinic_reviews").select("rating").eq("clinic_id", clinicId),
      supabase
        .from("appointments")
        .select("status")
        .eq("clinic_id", clinicId)
        .in("status", ["completed", "no_show"]),
      supabase
        .from("clinic_whatsapp_config")
        .select("connection_status")
        .eq("clinic_id", clinicId)
        .maybeSingle(),
    ]);

  const reviews = reviewsResult.data ?? [];
  const completed = (appointmentsResult.data ?? []).filter(
    (a) => a.status === "completed",
  ).length;
  const noShowCount = (appointmentsResult.data ?? []).filter(
    (a) => a.status === "no_show",
  ).length;
  const showUpRate =
    completed + noShowCount > 0
      ? Math.round((completed / (completed + noShowCount)) * 100)
      : 0;
  const averageRating =
    reviews.length > 0
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
      : null;

  return {
    ok: true,
    data: {
      clinicId,
      clinicName: clinic?.name ?? "your clinic",
      canWrite: canWriteClinic(access.role),
      whatsappConnected:
        whatsappResult.data?.connection_status === "connected",
      receiptAutoSend: clinic?.auto_send_whatsapp_receipt ?? false,
      timezone: clinic?.timezone ?? "Asia/Karachi",
      reviewUrl: clinic?.google_review_url ?? "",
      doctors: doctorsResult.data ?? [],
      templates,
      automations,
      metrics: {
        remindersSent: logsResult.count ?? 0,
        completed,
        noShowCount,
        showUpRate,
        reviewsCount: reviews.length,
        averageRating,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 2. setEngagementAutomationAction — toggle or config one automation
// ---------------------------------------------------------------------------

/**
 * Flips the switch (or writes config) for a single automation. The receipt
 * toggle additionally mirrors into `clinics.auto_send_whatsapp_receipt` — the
 * real column the billing flow reads before sending a receipt.
 */
export async function setEngagementAutomationAction(
  input: unknown,
): Promise<ActionResult<{ automationType: EngagementAutomationInput["automationType"]; enabled: boolean }>> {
  const auth = await requireEngagementWrite();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const parsed = engagementAutomationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const { automationType, enabled, config } = parsed.data;

  const { error } = await supabase.from("engagement_automations").upsert(
    {
      clinic_id: clinicId,
      automation_type: automationType,
      enabled,
      config,
    },
    { onConflict: "clinic_id,automation_type" },
  );
  if (error) {
    return { ok: false, message: "Could not update the automation." };
  }

  if (automationType === "receipt_delivery") {
    const { error: clinicError } = await supabase
      .from("clinics")
      .update({ auto_send_whatsapp_receipt: enabled })
      .eq("id", clinicId);
    if (clinicError) {
      return { ok: false, message: "Could not update receipt delivery." };
    }
  }

  revalidatePath(ENGAGEMENT_PATH);
  return { ok: true, data: { automationType, enabled } };
}

// ---------------------------------------------------------------------------
// 3. saveEngagementTemplateAction — edit message copy
// ---------------------------------------------------------------------------

export async function saveEngagementTemplateAction(
  input: unknown,
): Promise<ActionResult<{ type: EngagementTemplateInput["type"] }>> {
  const auth = await requireEngagementWrite();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const parsed = engagementTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const { error } = await supabase.from("engagement_templates").upsert(
    {
      clinic_id: clinicId,
      type: parsed.data.type,
      template_text: parsed.data.templateText,
      enabled: parsed.data.enabled,
    },
    { onConflict: "clinic_id,type" },
  );
  if (error) {
    return { ok: false, message: "Could not save the message." };
  }

  revalidatePath(ENGAGEMENT_PATH);
  return { ok: true, data: { type: parsed.data.type } };
}

// ---------------------------------------------------------------------------
// 4. saveEngagementReminderFormAction — the "Create New Reminder" popup
// ---------------------------------------------------------------------------

/**
 * Saves the whole Reminders-tab popup in one shot: the template copy
 * (`engagement_templates`) plus the automation's config (`engagement_name`,
 * message header, delay, doctor scope). For `appointment_reminder` the delay
 * is persisted as `delay_value` + `delay_unit` AND as a computed
 * `delay_hours` the cron keeps reading untouched.
 */
export async function saveEngagementReminderFormAction(
  input: unknown,
): Promise<ActionResult<{ type: EngagementReminderFormInput["type"] }>> {
  const auth = await requireEngagementWrite();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const parsed = engagementReminderFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const form = parsed.data;

  const config: Record<string, unknown> = {
    template_name: form.templateName,
    template_header: form.templateHeader,
    template_header_type: form.headerType ?? (form.templateHeader ? "text" : "none"),
    template_header_image: form.headerImage ?? "",
  };
  if (form.type === "appointment_reminder") {
    const delayValue = form.delayValue ?? 24;
    const delayUnit = form.delayUnit ?? "hours";
    config.trigger = form.trigger ?? "before";
    config.delay_value = delayValue;
    config.delay_unit = delayUnit;
    config.delay_hours =
      delayUnit === "hours" ? delayValue : Math.round(delayValue * 24);
    config.doctor_scope = form.doctorScope ?? "all";
    config.doctor_id = form.doctorScope === "specific" ? (form.doctorId ?? "") : "";
  }

  const [templateResult, automationResult] = await Promise.all([
    supabase.from("engagement_templates").upsert(
      {
        clinic_id: clinicId,
        type: form.type,
        template_text: form.templateText,
        enabled: true,
      },
      { onConflict: "clinic_id,type" },
    ),
    supabase.from("engagement_automations").upsert(
      {
        clinic_id: clinicId,
        automation_type: form.type,
        enabled: true,
        config,
      },
      { onConflict: "clinic_id,automation_type" },
    ),
  ]);

  if (templateResult.error || automationResult.error) {
    return { ok: false, message: "Could not save the reminder." };
  }

  revalidatePath(ENGAGEMENT_PATH);
  return { ok: true, data: { type: form.type } };
}

// ---------------------------------------------------------------------------
// 5. deleteEngagementReminderAction — remove a reminder from the Active list
// ---------------------------------------------------------------------------

/**
 * Removes a clinic's pre-appointment reminder: the template copy is deleted
 * and the automation is switched off with a `deleted` marker. The marker is the
 * contract with `ensure_engagement_defaults` — that seeder only inserts
 * MISSING rows ("on conflict do nothing"), so an automation row kept with
 * `config.deleted: true` stays deleted across refreshes. Saving the reminder
 * again (New Reminder / Edit) writes a fresh config without the marker.
 */
export async function deleteEngagementReminderAction(
  input: unknown,
): Promise<ActionResult<{ type: "appointment_reminder" }>> {
  const auth = await requireEngagementWrite();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const parsed = z
    .object({ type: z.literal("appointment_reminder") })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid request." };
  }

  const type = parsed.data.type;
  const [automationResult, templateResult] = await Promise.all([
    supabase.from("engagement_automations").upsert(
      {
        clinic_id: clinicId,
        automation_type: type,
        enabled: false,
        config: { deleted: true },
      },
      { onConflict: "clinic_id,automation_type" },
    ),
    supabase.from("engagement_templates").delete().eq("clinic_id", clinicId).eq("type", type),
  ]);

  if (automationResult.error || templateResult.error) {
    return { ok: false, message: "Could not delete the reminder." };
  }

  revalidatePath(ENGAGEMENT_PATH);
  return { ok: true, data: { type } };
}

// ---------------------------------------------------------------------------
// 6. saveEngagementGeneralSettingsAction — timezone + maps link
// ---------------------------------------------------------------------------

export async function saveEngagementGeneralSettingsAction(
  input: unknown,
): Promise<ActionResult<{ saved: true }>> {
  const auth = await requireEngagementWrite();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const parsed = engagementGeneralSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const [clinicsResult, automationResult] = await Promise.all([
    supabase.from("clinics").update({ timezone: parsed.data.timezone }).eq("id", clinicId),
    supabase.from("engagement_automations").upsert(
      {
        clinic_id: clinicId,
        automation_type: "general",
        enabled: true,
        config: { maps_link: parsed.data.mapsLink },
      },
      { onConflict: "clinic_id,automation_type" },
    ),
  ]);

  if (clinicsResult.error || automationResult.error) {
    return { ok: false, message: "Could not save general settings." };
  }

  revalidatePath(ENGAGEMENT_PATH);
  return { ok: true, data: { saved: true } };
}

// ---------------------------------------------------------------------------
// 7. addClinicReviewAction — log a review from the metrics card
// ---------------------------------------------------------------------------

/** Fresh review tally so the card can re-render without a full reload. */
export type ReviewTally = {
  reviewsCount: number;
  averageRating: number | null;
};

export async function addClinicReviewAction(
  input: unknown,
): Promise<ActionResult<ReviewTally>> {
  const auth = await requireEngagementWrite();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const parsed = addClinicReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const { error } = await supabase.from("clinic_reviews").insert({
    clinic_id: clinicId,
    rating: parsed.data.rating,
    reviewer_name: parsed.data.reviewerName || null,
    comment: parsed.data.comment || null,
    source: "manual",
  });
  if (error) {
    return { ok: false, message: "Could not save the review." };
  }

  const { data: reviews } = await supabase
    .from("clinic_reviews")
    .select("rating")
    .eq("clinic_id", clinicId);
  const list = reviews ?? [];
  const averageRating =
    list.length > 0
      ? Math.round((list.reduce((sum, r) => sum + r.rating, 0) / list.length) * 10) / 10
      : null;

  revalidatePath(ENGAGEMENT_PATH);
  return { ok: true, data: { reviewsCount: list.length, averageRating } };
}

// ---------------------------------------------------------------------------
// 8. engagementLogMessage — the outbound log writer (service-side)
// ---------------------------------------------------------------------------

/**
 * Appends a row to `engagement_logs`. Called by the appointment-reminder cron
 * and by future dispatchers (review requests, follow-ups). Kept in this module
 * so the nursery of default message statuses lives next to the page that
 * reports on them. Not reachable from the browser — RLS blocks client inserts.
 */
export async function engagementLogMessage(
  supabase: SupabaseClient<Database>,
  args: {
    clinicId: string;
    automationType: string;
    patientId?: string | null;
    status?: "queued" | "sent" | "failed" | "delivered";
    responseData?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from("engagement_logs").insert({
    clinic_id: args.clinicId,
    patient_id: args.patientId ?? null,
    automation_type: args.automationType,
    message_status: args.status ?? "sent",
    sent_at: new Date().toISOString(),
    response_data: args.responseData ?? {},
  });
}