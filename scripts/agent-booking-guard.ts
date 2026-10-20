/**
 * scripts/agent-booking-guard.ts
 *
 * Regression checks for the booking-failure path — the one that used to tell
 * the patient "there's a system issue" instead of a usable reason.
 *
 *   npx tsx scripts/agent-booking-guard.ts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { AI_TOOLS } from "@/lib/ai/tools";
import { createAppointmentService } from "@/lib/booking-service";
import { utcIsoToClinicLocalInput } from "@/lib/time";

const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const CLINIC_ID = "b385bf89-4aa1-4ca2-9b2c-1c5d67e85e1a";
const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "[PASS]" : "[FAIL]"} ${name}${detail ? `  (${detail})` : ""}`);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, timezone")
    .eq("id", CLINIC_ID)
    .single();
  const { data: existing } = await supabase
    .from("appointments")
    .select("id, start_time, end_time, service_id, doctor_id")
    .eq("clinic_id", CLINIC_ID)
    .eq("booking_source", "ai_agent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing) throw new Error("no ai_agent appointment to test against");


  // ── 1. A taken slot must produce a FRIENDLY reason, not a raw error ────────
  const startLocal = utcIsoToClinicLocalInput(existing.start_time, clinic!.timezone);

  const conflict = await createAppointmentService(
    supabase,
    { id: CLINIC_ID, timezone: clinic!.timezone },
    {
      patient: { name: "Conflict Probe", phone: "+923000000001" },
      serviceId: existing.service_id,
      doctorId: existing.doctor_id,
      start: startLocal,
      bookingSource: "guard_test",
    },
  );
  const msg = conflict.ok ? "" : conflict.message;
  check(
    "taken slot → booking refused",
    !conflict.ok,
    conflict.ok ? "it was booked (unexpected)" : msg,
  );
  check(
    "taken slot → friendly reason, no raw JS error",
    /overlap|full|unavailable|taken/i.test(msg) &&
      !/undefined|Cannot read|\.rest|is not a function/i.test(msg),
    msg,
  );

  // ── 2. The AI tool must not leak an internal stack string ─────────────────
  const bookTool = AI_TOOLS.find((t) => t.name === "book_appointment")!;
  const toolResult = await bookTool.execute(
    {
      supabase,
      clinic: { id: CLINIC_ID, timezone: clinic!.timezone },
      settings: null,
      bookingSource: "guard_test",
    },
    {
      patient_name: "Guard Probe",
      patient_phone: "+923000000002",
      slot_time: startLocal,
      appointment_type: "CLINIC_VISIT",
      chief_complaint: "conflict probe",
      service_id: existing.service_id,
      doctor_id: existing.doctor_id,
    },
  );
  const toolError = String((toolResult as { error?: string }).error ?? "");
  check(
    "book_appointment tool error is patient-safe",
    toolError.length > 0 &&
      !/Cannot read properties|undefined \(reading/i.test(toolError),
    toolError.slice(0, 160),
  );
  check(
    "book_appointment tool error mentions the reason",
    /overlap|full|unavailable|taken/i.test(toolError),
    toolError.slice(0, 160),
  );

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exit(1);
}

void main();
