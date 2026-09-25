import { NextResponse } from "next/server";

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
 *     start is within the next REMINDER_WINDOW_HOURS and that have no sent
 *     marker are considered; the marker is written only after a successful
 *     send, so transient failures retry on the next run.
 *   - Channel gating per patient: WhatsApp reminders go only to patients whose
 *     `notification_preference` is `whatsapp` or `both` AND who have a stored
 *     WhatsApp number.
 *   - Free-form sends need Meta's open 24h customer-service window; failures
 *     are logged as app events and never crash the run.
 */

const REMINDER_WINDOW_HOURS = 24;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

type ReminderRow = {
  id: string;
  start_time: string;
  clinic_id: string;
  services: { name: string } | { name: string }[] | null;
  clinics: { name: string; timezone: string } | null;
  patients: {
    name: string;
    whatsapp_number: string | null;
    notification_preference: NotificationPreference | null;
  } | null;
};

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createWidgetClient();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 3_600_000);

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `id, start_time, clinic_id,
       services(name),
       clinics(name, timezone),
       patients(name, whatsapp_number, notification_preference)`,
    )
    .in("status", ["pending", "confirmed"])
    .gte("start_time", now.toISOString())
    .lte("start_time", windowEnd.toISOString())
    .is("reminder_sent_at", null)
    .order("start_time", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[cron-reminders] query failed", error.message);
    return NextResponse.json({ ok: false, error: "Query failed." }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  for (const raw of data ?? []) {
    const row = raw as ReminderRow;
    try {
      const result = await sendReminderForAppointment(supabase, row);
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

  const result = await notifyPatient({
    clinicId: row.clinic_id,
    patientId: undefined,
    channel: "whatsapp",
    type: "appointment_reminder",
    to: patient.whatsapp_number,
    payload: {
      patientName: patient.name,
      date,
      time,
      service: serviceName,
      clinicName,
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
