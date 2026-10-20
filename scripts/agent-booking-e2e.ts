/**
 * scripts/agent-booking-e2e.ts
 *
 * Live end-to-end test of the AI receptionist's BOOKING path.
 *
 * Drives the REAL orchestrator (`runReceptionistTurn`) with the REAL Gemini
 * provider against the REAL Supabase project, using a scripted patient
 * conversation, then verifies that an appointment row was actually written.
 *
 *   npx tsx scripts/agent-booking-e2e.ts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { runReceptionistTurn } from "@/lib/ai/orchestrator";
import { resolveProviderForClinic } from "@/lib/ai/provider";
import { buildWorkingHoursSummary, type RuleView } from "@/lib/appointments-view";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import type { ReceptionistContext } from "@/lib/ai/system-prompt";
import type { ToolContext } from "@/lib/ai/tools";

// ── env ───────────────────────────────────────────────────────────────────────
const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const CLINIC_ID = "b385bf89-4aa1-4ca2-9b2c-1c5d67e85e1a"; // SkinDotsClinics
const PATIENT_PHONE = "+923001234567";
const COMPLAINT = "acne and skin irritation on face";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type Turn = { role: "user" | "assistant"; content: string };

type PatientState = {
  answered: Set<string>;
  slotChosen: boolean;
  /** The clinic-local slot the patient picked, e.g. "2026-10-23T14:00". */
  slotPicked?: string;
};

/**
 * Ordered topics the receptionist asks for. The first topic that is both
 * mentioned in the reply and still unanswered gets answered.
 */
const TOPICS: Array<{ key: string; test: RegExp; answer: string }> = [
  { key: "slot", test: /1️⃣[^\n]*(\d{1,2}:\d{2}|AM|PM)/i, answer: "__SLOT__" },
  {
    key: "mode",
    test: /(in-clinic|in clinic|online video|clinic visit|video consultation|kis tarah)/i,
    answer: "In-Clinic Visit chahiye.",
  },
  { key: "name", test: /(naam|pnaam|\bname\b)/i, answer: "Mera naam Zainab hai." },
  {
    key: "phone",
    test: /(phone|whatsapp|contact number|mobile number|number)/i,
    answer: `Mera WhatsApp number ${PATIENT_PHONE} hai.`,
  },
  {
    key: "complaint",
    test: /(masla|complaint|symptom|kis liye|dekhana|problem|kya masla|kis cheez)/i,
    answer: `Mera masla ${COMPLAINT} hai.`,
  },
  { key: "doctor", test: /(doctor|dr\.)/i, answer: "Dr. Umar Farooq se." },
  {
    key: "service",
    test: /(service|consultation & analysis|chemical peel|konsi)/i,
    answer: "Skin Consultation & Analysis wala.",
  },
  {
    key: "date",
    test: /(date|kab|kis din|aaj|kal|par aana|aa rahi)/i,
    answer: "Kal aa rahi hun.",
  },
];

function nextPatientMessage(reply: string, s: PatientState): string {
  for (const topic of TOPICS) {
    if (s.answered.has(topic.key)) continue;
    if (!topic.test.test(reply)) continue;
    s.answered.add(topic.key);
    if (topic.key === "slot") {
      s.slotChosen = true;
      const m = reply.match(/1️⃣[^\n]*(\d{1,2}:\d{2}[^0-9]*[AaPp][Mm])/i);
      return m
        ? `Mujhe ${m[0].replace(/^1️⃣\s*/, "")} wala time le lena hai.`
        : "Pehla wala time le lena hai.";
    }
    return topic.answer;
  }
  return "Haan, please kar dein.";
}

/**
 * The slot list is normally rendered as a widget component, not as text, so
 * prefer the component's first slot (an exact clinic-local `YYYY-MM-DDTHH:mm`)
 * over scraping the prose.
 */
function slotFromComponent(
  component: Awaited<ReturnType<typeof runReceptionistTurn>>["component"],
): string | undefined {
  if (component?.type !== "slotList") return undefined;
  return component.data[0]?.startTime;
}

async function main() {
  const startedAt = new Date();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, name, doctor_name, phone, email, address, timezone")
    .eq("id", CLINIC_ID)
    .single();
  if (!clinic) throw new Error("clinic not found");

  const [{ data: settings }, { data: rules }] = await Promise.all([
    supabase.from("clinic_ai_settings").select("*").eq("clinic_id", CLINIC_ID).maybeSingle(),
    supabase
      .from("availability_rules")
      .select("day_of_week, start_time, end_time, enabled")
      .eq("clinic_id", CLINIC_ID)
      .is("doctor_id", null)
      .order("day_of_week", { ascending: true }),
  ]);

  const ruleViews: RuleView[] = (rules ?? []).map((r) => ({
    dayOfWeek: r.day_of_week,
    startTime: r.start_time,
    endTime: r.end_time,
    enabled: r.enabled,
  }));

  const context: ReceptionistContext = {
    clinic: {
      name: clinic.name,
      doctor_name: clinic.doctor_name,
      phone: clinic.phone,
      email: clinic.email,
      address: clinic.address,
    },
    workingHoursSummary: buildWorkingHoursSummary(ruleViews),
    settings: settings ?? null,
  };

  const toolContext: ToolContext = {
    supabase,
    clinic: { id: clinic.id, timezone: clinic.timezone },
    settings: settings ?? null,
    bookingSource: "ai_agent",
  };

  const provider = await resolveProviderForClinic(CLINIC_ID);

  // Gemini free tier: 15 generate_content requests/minute for this model.
  // Space every provider call so the test is not rate-limited.
  const MIN_GAP_MS = 5200;
  let lastCall = 0;
  const throttled = {
    id: "throttled",
    async chat(params: Parameters<typeof provider.chat>[0]) {
      const wait = MIN_GAP_MS - (Date.now() - lastCall);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
      return provider.chat(params);
    },
    async complete(params: Parameters<typeof provider.complete>[0]) {
      const wait = MIN_GAP_MS - (Date.now() - lastCall);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
      return provider.complete(params);
    },
    async completeJson(params: Parameters<typeof provider.completeJson>[0]) {
      const wait = MIN_GAP_MS - (Date.now() - lastCall);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
      return provider.completeJson(params);
    },
  };

  const history: Turn[] = [];
  const state: PatientState = {
    answered: new Set<string>(),
    slotChosen: false,
  };
  let finalResult: Awaited<ReturnType<typeof runReceptionistTurn>> | null = null;

  const opening = "Mujhe doctor se appointment leni hai, kuch masla hai.";
  history.push({ role: "user", content: opening });

  for (let turn = 0; turn < 12; turn++) {
    finalResult = await runReceptionistTurn({
      supabase,
      provider: throttled,
      context,
      toolContext,
      history,
      sessionId: crypto.randomUUID(),
    });

    console.log(`\n──── TURN ${turn + 1} ────`);
    console.log(`patient : ${history[history.length - 1].content}`);
    console.log(`agent   : ${finalResult.reply}`);
    console.log(
      `outcome=${finalResult.outcome} attempted=${finalResult.bookingAttempted} error=${finalResult.error ?? "-"}`,
    );

    history.push({ role: "assistant", content: finalResult.reply });

    if (finalResult.component?.type === "confirmation") {
      console.log("CONFIRMATION COMPONENT:", JSON.stringify(finalResult.component.data));
      break;
    }

    // Prefer the rendered slot list: it carries the exact clinic-local slot.
    const componentSlot = slotFromComponent(finalResult.component);
    let next: string;
    if (componentSlot && !state.answered.has("slot")) {
      state.answered.add("slot");
      state.slotChosen = true;
      state.slotPicked = componentSlot;
      next = `Mujhe ${componentSlot.slice(11)} wala time le lena hai.`;
      console.log(`patient picked slot ${componentSlot}`);
    } else {
      next = nextPatientMessage(finalResult.reply, state);
    }
    if (next === history[history.length - 1].content) break;
    history.push({ role: "user", content: next });
  }

  // ── verification ───────────────────────────────────────────────────────────
  const { data: appts } = await supabase
    .from("appointments")
    .select(
      "id, status, booking_source, start_time, end_time, appointment_type, consultation_type, meeting_link, chief_complaint, service_id, doctor_id, patient_id, notes, created_at",
    )
    .eq("clinic_id", CLINIC_ID)
    .gte("created_at", startedAt.toISOString())
    .order("created_at", { ascending: false });

  console.log("\n═══ VERIFICATION: appointments created during this run ═══");
  console.log(appts && appts.length > 0 ? JSON.stringify(appts, null, 2) : "NONE — booking did NOT happen.");

  if (appts && appts.length > 0) {
    const a = appts[0];
    const { data: patient } = await supabase
      .from("patients")
      .select("id, name, phone, email")
      .eq("id", a.patient_id)
      .maybeSingle();
    console.log("patient row:", JSON.stringify(patient));

    // The stored UTC instant must land on the clinic-local wall clock the
    // agent promised — a naive local->UTC conversion that applies the
    // offset twice silently shifted every booking by one full offset.
    const storedLocal = utcIsoToClinicLocalInput(a.start_time, clinic.timezone);
    const promised = finalResult?.component?.type === "confirmation"
      ? finalResult.component.data.startTime
      : undefined;
    console.log(`stored UTC   : ${a.start_time}`);
    console.log(`clinic-local : ${storedLocal}`);
    console.log(`agent showed : ${promised ?? "(no confirmation component)"}`);

    const localFromStored = storedLocal;
    const slotFromAgent = state.slotPicked ?? null;
    console.log(`slot the patient picked: ${slotFromAgent ?? "(unknown)"}`);

    const timeOk =
      !slotFromAgent ||
      localFromStored === slotFromAgent ||
      // The agent may reformat the time ("2:00 PM" vs "14:00").
      slotFromAgent.replace(/(\d{1,2}):(\d{2})\s*(AM|PM)/i, (_, h, m, ap) => {
        const hour = (Number(h) % 12) + (ap.toUpperCase() === "PM" ? 12 : 0);
        return `${String(hour).padStart(2, "0")}:${m}`;
      }) === localFromStored.slice(11);

    console.log(
      `RESULT: BOOKED ✅  id=${a.id} status=${a.status} source=${a.booking_source} type=${a.appointment_type}`,
    );
    console.log(
      timeOk
        ? `TIME CHECK: OK ✅  stored instant == promised slot (${localFromStored})`
        : `TIME CHECK: MISMATCH ❌  stored ${localFromStored} != promised ${slotFromAgent}`,
    );
    if (!timeOk) process.exitCode = 1;
  } else {
    console.log("RESULT: FAILED ❌");
    process.exitCode = 1;
  }
}

void main();
