import { NextResponse } from "next/server";

import { engagementLogMessage } from "@/lib/actions/engagement";
import { notifyPatient } from "@/lib/notifications";
import { logAppEvent } from "@/lib/observability";
import { createWidgetClient } from "@/lib/supabase/widget";
import type { NotificationPreference } from "@/types/database";

/**
 * Appointment reminder cron (Phase 13) — `appointment_reminder`'s first real
 * sender. Designed to be hit by an external scheduler (Vercel Cron, GitHub
 * Actions, curl) every 10–60 minutes.
 *
 * Contract:
 *   - Auth: `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret` header).
 *   - Idempotent via `appointments.reminder_sent_at` — only appointments whose
 *     start is within the reminder window and that have no sent marker are
 *     considered; the marker is written only after a successful send, so
 *     transient failures retry on the next run.
 *   - Channel gating per patient: WhatsApp reminders go only to patients whose
 *     `notification_preference` is `whatsapp` or `both` AND who have a stored
 *     WhatsApp number.
 *   - Free-form sends need Meta's open 24h customer-service window; failures
 *     are logged as app events and never crash the run.
 *
 * Routine and window come from the Engagement page (migration 0062):
 *   - Each clinic's `appointment_reminder` automation row decides enabled +
 *     `delay_hours` (default 24h). A clinic with NO row is treated as enabled
 *     with the defaults, so pre-engagement clinics keep their reminders; an
 *     explicit switch-off in the page disables the clinic.
 *   - `config.doctor_id` (with `doctor_scope: "specific"`) restricts the run
 *     to one doctor; `config.template_header` is prepended to the copy when set.
 *   - Message copy comes from `engagement_templates.appointment_reminder`
 *     (falling back to the all-purpose reminder text) and `{clinic_location}`
 *     from the `general` automation's maps link.
 *   - Every successful send is mirrored into `engagement_logs` so the page's
 *     "Reminders Sent" metric reflects reality.
 */

const DEFAULT_REMINDER_HOURS = 24;
const DEFAULT_REMINDER_TEMPLATE: string | null = null;
/**
 * Only used when a clinic set a message header (Engagement popup) but has not
 * saved template copy — the header still needs a body to ride on.
 */
const DEFAULT_REMINDER_TEXT =
  "Hi {patient_name}! A friendly reminder about your appointment with {doctor_name} at {clinic_name} on {appointment_date} at {appointment_time}. ⏰ We look forward to seeing you! {clinic_location}";

type AutomationRow = {
  clinic_id: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
};

type ReminderRow = {
  id: string;
  patient_id: string;
  start_time: string;
  clinic_id: string;
  services: { name: string } | { name: string }[] | null;
  clinics: { name: string; timezone: string } | null;
  doctors: { id: string; name: string } | null;
  patients: {
    name: string;
    whatsapp_number: string | null;
    notification_preference: NotificationPreference | null;
  } | null;
};

type ReminderSettings = {
  disabled: boolean;
  trigger: "before" | "after";
  hours: number;
  template: string | null;
  header: string | null;
  doctorId: string | null;
  mapsLink: string;
};

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createWidgetClient();
  const now = new Date();

  const [remindersResult, templatesResult, generalResult] = await Promise.all([
    supabase
      .from("engagement_automations")
      .select("clinic_id, enabled, config")
      .eq("automation_type", "appointment_reminder"),
    supabase
      .from("engagement_templates")
      .select("clinic_id, template_text")
      .eq("type", "appointment_reminder"),
    supabase
      .from("engagement_automations")
      .select("clinic_id, config")
      .eq("automation_type", "general"),
  ]);

  if (remindersResult.error || templatesResult.error || generalResult.error) {
    console.error("[cron-reminders] engagement settings query failed");
    return NextResponse.json({ ok: false, error: "Query failed." }, { status: 500 });
  }

  const disabledClinicIds = new Set<string>();
  const hoursByClinic = new Map<string, number>();
  const triggerByClinic = new Map<string, "before" | "after">();
  const headerByClinic = new Map<string, string | null>();
  const doctorByClinic = new Map<string, string | null>();
  for (const row of (remindersResult.data ?? []) as AutomationRow[]) {
    if (!row.enabled) {
      disabledClinicIds.add(row.clinic_id);
      continue;
    }
    const rawHours = row.config?.delay_hours;
    const hours =
      typeof rawHours === "number" && rawHours >= 0
        ? rawHours
        : DEFAULT_REMINDER_HOURS;
    hoursByClinic.set(row.clinic_id, hours);
    triggerByClinic.set(
      row.clinic_id,
      row.config?.trigger === "after" ? "after" : "before",
    );
    const header = row.config?.template_header;
    headerByClinic.set(
      row.clinic_id,
      row.config?.template_header_type === "image" || row.config?.template_header_type === "none"
        ? null
        : typeof header === "string" && header.trim()
        ? header.trim()
        : null,
    );
    const doctorId = row.config?.doctor_id;
    doctorByClinic.set(
      row.clinic_id,
      row.config?.doctor_scope === "specific" && typeof doctorId === "string" && doctorId
        ? doctorId
        : null,
    );
  }

  // Two bounding windows: reminders that fire BEFORE the visit look ahead,
  // reminders that fire AFTER look back at just-started/ended appointments.
  let beforeWindow = DEFAULT_REMINDER_HOURS;
  let afterWindow = 0;
  for (const [clinicId, hours] of hoursByClinic) {
    if ((triggerByClinic.get(clinicId) ?? "before") === "after") {
      afterWindow = Math.max(afterWindow, hours);
    } else {
      beforeWindow = Math.max(beforeWindow, hours);
    }
  }
  const templateByClinic = new Map<string, string>();
  for (const row of templatesResult.data ?? []) {
    templateByClinic.set(row.clinic_id, row.template_text);
  }
  const mapsByClinic = new Map<string, string>();
  for (const row of generalResult.data ?? []) {
    const link = row.config?.maps_link;
    if (typeof link === "string") mapsByClinic.set(row.clinic_id, link);
  }

  const clinicSettings = (clinicId: string): ReminderSettings => {
    if (disabledClinicIds.has(clinicId)) {
      return {
        disabled: true,
        trigger: "before",
        hours: DEFAULT_REMINDER_HOURS,
        template: null,
        header: null,
        doctorId: null,
        mapsLink: "",
      };
    }
    return {
      disabled: false,
      trigger: triggerByClinic.get(clinicId) ?? "before",
      hours: hoursByClinic.get(clinicId) ?? DEFAULT_REMINDER_HOURS,
      template: templateByClinic.get(clinicId) ?? DEFAULT_REMINDER_TEMPLATE,
      header: headerByClinic.get(clinicId) ?? null,
      doctorId: doctorByClinic.get(clinicId) ?? null,
      mapsLink: mapsByClinic.get(clinicId) ?? "",
    };
  };

  // One folder of candidate rows across every enabled clinic: look back far
  // enough to catch "after" clinics, forward far enough for "before" ones,
  // then per-clinic/per-row filtering decides who is actually due.
  const windowStart = new Date(now.getTime() - afterWindow * 3_600_000);
  const windowEnd = new Date(now.getTime() + beforeWindow * 3_600_000);

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `id, patient_id, start_time, clinic_id,
       services(name),
       clinics(name, timezone),
       doctors(id, name),
       patients(name, whatsapp_number, notification_preference)`,
    )
    .in("status", ["pending", "confirmed"])
    .gte("start_time", windowStart.toISOString())
    .lte("start_time", windowEnd.toISOString())
    .is("reminder_sent_at", null)
    .order("start_time", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[cron-reminders] query failed", error.message);
    return NextResponse.json({ ok: false, error: "Query failed." }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  for (const raw of data ?? []) {
    const row = raw as ReminderRow;
    const settings = clinicSettings(row.clinic_id);
    if (settings.disabled) {
      skipped += 1;
      continue;
    }
    if (settings.doctorId && row.doctors?.id !== settings.doctorId) {
      skipped += 1;
      continue;
    }

    const startMs = new Date(row.start_time).getTime();
    const delayMs = settings.hours * 3_600_000;
    const nowMs = now.getTime();
    // BEFORE: appointment is still ahead of us, within the clinic's window.
    // AFTER: appointment has already started, but not older than the window.
    const due =
      settings.trigger === "after"
        ? startMs <= nowMs && startMs >= nowMs - delayMs
        : startMs >= nowMs && startMs <= nowMs + delayMs;
    if (!due) {
      skipped += 1;
      continue;
    }
    try {
      const result = await sendReminderForAppointment(supabase, row, settings);
      if (result === "sent") {
        sent += 1;
        await supabase
          .from("appointments")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", row.id);
      } else {
        skipped += 1;
      }
    } catch (sendError) {
      skipped += 1;
      await logAppEvent(supabase, {
        clinicId: row.clinic_id,
        category: "email",
        event: "whatsapp_reminder_failed",
        severity: "warning",
        metadata: { appointmentId: row.id },
      });
      console.error("[cron-reminders] send threw", sendError);
    }
  }

  return NextResponse.json({ ok: true, considered: data?.length ?? 0, sent, skipped });
}

async function sendReminderForAppointment(
  supabase: Awaited<ReturnType<typeof createWidgetClient>>,
  row: ReminderRow,
  settings: ReminderSettings,
): Promise<"sent" | "skipped"> {
  const patient = row.patients;
  const serviceRaw = row.services;
  const serviceName = Array.isArray(serviceRaw)
    ? serviceRaw[0]?.name
    : serviceRaw?.name;
  const clinicName = row.clinics?.name ?? "the clinic";
  const timezone = row.clinics?.timezone ?? "UTC";

  if (!patient || !serviceName) return "skipped";

  const preference = patient.notification_preference ?? "email";
  if (preference !== "whatsapp" && preference !== "both") return "skipped";
  if (!patient.whatsapp_number) return "skipped";

  const { date, time } = formatClinicLocal(row.start_time, timezone);

  const body = settings.template ?? (settings.header ? DEFAULT_REMINDER_TEXT : null);
  const template = settings.header && body ? `${settings.header}\n\n${body}` : body;

  const result = await notifyPatient({
    clinicId: row.clinic_id,
    patientId: row.patient_id,
    channel: "whatsapp",
    type: "appointment_reminder",
    to: patient.whatsapp_number,
    payload: {
      patientName: patient.name,
      date,
      time,
      service: serviceName,
      clinicName,
      doctorName: row.doctors?.name ?? undefined,
      template: template ?? undefined,
      location: settings.mapsLink || undefined,
    },
  });
  if (!result.success) {
    await logAppEvent(supabase, {
      clinicId: row.clinic_id,
      category: "email",
      event: "whatsapp_reminder_failed",
      severity: "warning",
      metadata: { appointmentId: row.id, error: result.error ?? "unknown" },
    });
    return "skipped";
  }

  // Mirror into engagement_logs: the page's "Reminders Sent" metric is this
  // table, and the send is the only real dispatch path today.
  await engagementLogMessage(supabase, {
    clinicId: row.clinic_id,
    patientId: row.patient_id,
    automationType: "appointment_reminder",
    status: "sent",
    responseData: { appointmentId: row.id },
  });

  return "sent";
}

/** Clinic-local display strings, e.g. date="Tue, Sep 1" time="9:30 AM". */
function formatClinicLocal(
  isoUtc: string,
  timezone: string,
): { date: string; time: string } {
  try {
    const date = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(isoUtc));
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(isoUtc));
    return { date, time };
  } catch {
    return { date: isoUtc.slice(0, 10), time: isoUtc.slice(11, 16) };
  }
}