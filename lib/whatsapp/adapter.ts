import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ReceptionistProviderError,
  runReceptionistTurn,
} from "@/lib/ai/orchestrator";
import { resolveProviderForClinic } from "@/lib/ai/provider";
import type { ReceptionistContext } from "@/lib/ai/system-prompt";
import type { ToolContext } from "@/lib/ai/tools";
import { buildWorkingHoursSummary, type RuleView } from "@/lib/appointments-view";
import {
  createAppointmentService,
  listAvailableSlots,
} from "@/lib/booking-service";
import {
  buildPendingFollowUpState,
  getActivePreConsultationQuestions,
  recordPreConsultationAnswers,
} from "@/lib/pre-consultation";
import { parseDateSafe } from "@/lib/utils/datetime";
import type { ClinicAiSettings, Database } from "@/types/database";
import {
  sendWhatsappButtons,
  sendWhatsappList,
  sendWhatsappText,
  type WhatsappCredentials,
  type WhatsappListRow,
} from "@/lib/whatsapp/client";
import {
  ensureConversation,
  getRecentMessages,
  logWhatsappMessage,
  saveSessionState,
  touchConversation,
} from "@/lib/whatsapp/conversation";

/**
 * The WhatsApp channel adapter (Phase 13) — a thin translator between Meta's
 * Cloud API and the SHARED receptionist orchestrator. There is no second AI
 * brain here: open-ended input runs through the exact same
 * `runReceptionistTurn` used by the internal test chat and public widget, and
 * every booking action goes through the same `booking-service.ts` functions
 * the AI tools call.
 *
 * What IS WhatsApp-specific (and deliberately lives here, not in the shared
 * orchestrator):
 *   - message format translation (Meta envelope ↔ internal history),
 *   - deterministic handling of interactive list/button taps (Phase 6's
 *     "never route unambiguous selections through free-text LLM" lesson),
 *   - returning-patient recognition via phone-number identity,
 *   - per-thread server-side session state (`whatsapp_conversations`).
 */

// ── Inbound parsing ─────────────────────────────────────────────────────────

export type ParsedInbound = {
  phoneNumberId: string;
  fromWaId: string;
  profileName: string | null;
  messageId: string | null;
  kind: "text" | "interactive" | "other";
  text?: string;
  /** Echoed row/button id for interactive replies (deterministic payload). */
  interactiveId?: string;
  interactiveTitle?: string;
};

type WebhookEnvelope = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<Record<string, unknown>>;
        statuses?: Array<Record<string, unknown>>;
      };
    }>;
  }>;
};

/** Extract patient messages from a Meta webhook body; ignores statuses etc. */
export function parseWebhookMessages(raw: string): ParsedInbound[] {
  let envelope: WebhookEnvelope;
  try {
    envelope = JSON.parse(raw) as WebhookEnvelope;
  } catch {
    return [];
  }
  const results: ParsedInbound[] = [];
  for (const entry of envelope.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.metadata?.phone_number_id || !Array.isArray(value.messages)) {
        continue;
      }
      const contact = value.contacts?.[0];
      const profileName = contact?.profile?.name ?? null;
      for (const message of value.messages) {
        const messageId =
          typeof message.id === "string" ? message.id : null;
        const from = typeof message.from === "string" ? message.from : "";
        if (!from) continue;
        const base = {
          phoneNumberId: value.metadata.phone_number_id as string,
          fromWaId: from,
          profileName,
          messageId,
        };
        if (message.type === "text" && typeof message.text === "object" && message.text !== null && typeof (message.text as { body?: unknown }).body === "string") {
          results.push({ ...base, kind: "text", text: (message.text as { body: string }).body });
          continue;
        }
        if (
          message.type === "interactive" &&
          typeof message.interactive === "object" &&
          message.interactive !== null
        ) {
          const interactive = message.interactive as Record<string, unknown>;
          const reply =
            (interactive.list_reply as Record<string, unknown> | undefined) ??
            (interactive.button_reply as Record<string, unknown> | undefined);
          if (reply && typeof reply.id === "string") {
            results.push({
              ...base,
              kind: "interactive",
              interactiveId: reply.id,
              interactiveTitle:
                typeof reply.title === "string" ? reply.title : undefined,
            });
            continue;
          }
        }
        // Unsupported types (media, locations, …) still deserve an entry so
        // the adapter can answer politely instead of ignoring the patient.
        results.push({ ...base, kind: "other" });
      }
    }
  }
  return results;
}

// ── Session state shape ─────────────────────────────────────────────────────

type FlowStep =
  | "service"
  | "doctor"
  | "date"
  | "slot"
  | "preconsult"
  | "name"
  | "email"
  | "confirm";

/**
 * Phase 22 — deterministic during-booking questions inside the tap-driven
 * flow. When the clinic configured questions for the chosen service/doctor,
 * they're asked one at a time as plain text after the slot is picked and
 * before the confirmation ask; answers are keyed by question id and passed to
 * booking on confirm. (The open-ended AI path asks the same questions through
 * the shared getPreConsultationQuestions tool instead.)
 */
type PreConsultTracking = {
  questions: Array<{ id: string; text: string }>;
  answers: Record<string, string>;
  index: number;
};

/** Deterministic booking-flow state persisted between inbound messages. */
type FlowState = {
  step: FlowStep;
  serviceId?: string;
  serviceName?: string;
  doctorId?: string | null;
  doctorName?: string;
  date?: string;
  slot?: string;
  patientName?: string;
  patientEmail?: string;
  preConsult?: PreConsultTracking;
};

type SessionStateShape = {
  flow?: FlowState;
  lastAppointmentId?: string;
  /** Phase 22 — a booking that fired the after-booking follow-up and is still
   *  waiting for the patient's one-answer-per-message replies. */
  pendingFollowUp?: {
    appointmentId: string;
    questionIds: string[];
    questionTexts: string[];
    nextIndex: number;
  };
};

function readSession(state: Record<string, unknown>): SessionStateShape {
  return state as SessionStateShape;
}

function clearFlow(session: SessionStateShape): SessionStateShape {
  const next = { ...session };
  delete next.flow;
  return next;
}

// ── Formatting helpers (clinic-local naive values → display text) ──────────

function formatNaive(naive: string): string {
  const date = parseDateSafe(`${naive.slice(0, 10)}T${naive.slice(11, 16) || "00:00"}`);
  if (!date) return naive;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${day} at ${time}`;
}

const DATE_LIST_DAYS = 10;

function buildDateRows(): WhatsappListRow[] {
  const rows: WhatsappListRow[] = [];
  const today = new Date();
  for (let i = 0; i < DATE_LIST_DAYS; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(d);
    rows.push({ id: `date:${iso}`, title: i === 0 ? `Today (${label})` : label });
  }
  return rows;
}

// ── Adapter context ─────────────────────────────────────────────────────────

export type AdapterClinic = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  doctor_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type ProcessInboundInput = {
  supabase: SupabaseClient<Database>;
  clinic: AdapterClinic;
  settings: ClinicAiSettings | null;
  credentials: WhatsappCredentials;
  inbound: ParsedInbound;
};

/**
 * Process one parsed inbound message end-to-end. Never throws — the webhook
 * route fires this without awaiting after verification, so all failures are
 * caught, logged via app events, and swallowed to keep Meta retries sane.
 */
export async function processInboundMessage(
  input: ProcessInboundInput,
): Promise<void> {
  const { supabase, clinic, inbound } = input;
  try {
    const conversation = await ensureConversation(supabase, {
      clinicId: clinic.id,
      patientWhatsappNumber: inbound.fromWaId,
    });
    if (!conversation) {
      console.error("[whatsapp-adapter] could not ensure conversation", {
        clinicId: clinic.id,
      });
      return;
    }

    // 1. Persist the patient's message first. The unique wamid makes Meta
    //    retries no-ops at the storage layer.
    const patientContent = inbound.kind === "text" && inbound.text
      ? inbound.text.slice(0, 4096)
      : inbound.kind === "interactive"
        ? `[Selected option: ${inbound.interactiveTitle ?? inbound.interactiveId ?? ""}]`
        : "[Sent an unsupported message type]";

    if (inbound.messageId) {
      const stored = await logWhatsappMessage(supabase, {
        conversationId: conversation.id,
        clinicId: clinic.id,
        senderType: "patient",
        content: patientContent,
        metaMessageId: inbound.messageId,
      });
      if (!stored) return; // Duplicate webhook delivery — already handled.
    }

    await touchConversation(supabase, {
      conversationId: conversation.id,
      preview: patientContent,
      senderType: "patient",
      humanTakeover: conversation.human_takeover,
    });

    // 2. Human takeover (Phase 14): store + flag only, never auto-reply.
    if (conversation.human_takeover) {
      return;
    }

    // 3. Returning-patient recognition (WhatsApp-specific identity).
    const matchedPatient = await matchPatientByWhatsappNumber(
      supabase,
      clinic.id,
      inbound.fromWaId,
    );
    if (
      matchedPatient &&
      matchedPatient.id !== conversation.patient_id
    ) {
      await supabase
        .from("whatsapp_conversations")
        .update({ patient_id: matchedPatient.id })
        .eq("id", conversation.id);
      conversation.patient_id = matchedPatient.id;
    }

    // 4. Route: deterministic tap handling vs shared AI orchestrator.
    const session = readSession(conversation.session_state);
    if (
      inbound.kind === "interactive" &&
      inbound.interactiveId &&
      !conversation.human_takeover
    ) {
      const handled = await handleInteractiveTap(input, {
        conversation,
        session,
        matchedPatient,
      });
      if (handled) return;
      // Unrecognized/stale button id → fall through to the AI with the
      // logged "[Selected option: …]" message as context.
    }

    await runAiTurn(input, { conversation, session, matchedPatient });
  } catch (error) {
    console.error("[whatsapp-adapter] processing failed", {
      clinicId: clinic.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── Patient matching ────────────────────────────────────────────────────────

type MatchedPatient = { id: string; name: string; email: string | null };

async function matchPatientByWhatsappNumber(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  waId: string,
): Promise<MatchedPatient | null> {
  const { data } = await supabase
    .from("patients")
    .select("id, name, email")
    .eq("clinic_id", clinicId)
    .eq("whatsapp_number", waId)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// ── Deterministic interactive-tap handling ───────────────────────────────────

type TapContext = {
  conversation: { id: string; patient_id: string | null };
  session: SessionStateShape;
  matchedPatient: MatchedPatient | null;
};

async function handleInteractiveTap(
  input: ProcessInboundInput,
  ctx: TapContext,
): Promise<boolean> {
  const id = input.inbound.interactiveId ?? "";

  if (id.startsWith("svc:")) {
    return handleServiceTap(input, ctx, id.slice(4));
  }
  if (id.startsWith("doc:")) {
    return handleDoctorTap(input, ctx, id.slice(4));
  }
  if (id.startsWith("date:")) {
    return handleDateTap(input, ctx, id.slice(5));
  }
  if (id.startsWith("slot:")) {
    return handleSlotTap(input, ctx, id.slice(5));
  }
  if (id === "bk-yes") {
    await confirmBooking(input, ctx);
    return true;
  }
  if (id === "bk-no") {
    await persistAndReply(input, ctx.conversation.id, clearFlow(ctx.session), [
      "Okay, I won't book that. Is there anything else I can help you with?",
    ]);
    return true;
  }
  return false;
}

async function handleServiceTap(
  input: ProcessInboundInput,
  ctx: TapContext,
  serviceId: string,
): Promise<boolean> {
  const { supabase, clinic } = input;
  const { data: service } = await supabase
    .from("services")
    .select("id, name, duration_minutes")
    .eq("clinic_id", clinic.id)
    .eq("id", serviceId)
    .eq("status", "active")
    .maybeSingle();
  if (!service) return false;

  const { data: doctors } = await supabase
    .from("doctors")
    .select("id, name, specialty")
    .eq("clinic_id", clinic.id)
    .eq("is_visible", true)
    .order("created_at", { ascending: true });

  const flow: FlowState = {
    step: doctors && doctors.length > 1 ? "doctor" : "date",
    serviceId: service.id,
    serviceName: service.name,
  };

  if (doctors && doctors.length > 1) {
    const rows: WhatsappListRow[] = doctors.map((doctor) => ({
      id: `doc:${doctor.id}`,
      title: doctor.name,
      description: doctor.specialty ?? undefined,
    }));
    rows.push({ id: "doc:any", title: "No preference" });
    await persistAndReply(input, ctx.conversation.id, { ...ctx.session, flow }, [], {
      list: {
        body: `${service.name} — which doctor would you like to see?`,
        buttonText: "Choose doctor",
        header: "Select a doctor",
        rows,
      },
    });
    return true;
  }

  await sendDateStep(input, ctx.conversation.id, { ...ctx.session, flow });
  return true;
}

async function handleDoctorTap(
  input: ProcessInboundInput,
  ctx: TapContext,
  rawDoctor: string,
): Promise<boolean> {
  const flow = ctx.session.flow;
  if (!flow?.serviceId) return false;

  if (rawDoctor === "any") {
    const next: SessionStateShape = {
      ...ctx.session,
      flow: { ...flow, step: "date", doctorId: null, doctorName: undefined },
    };
    await sendDateStep(input, ctx.conversation.id, next);
    return true;
  }

  const { data: doctor } = await input.supabase
    .from("doctors")
    .select("id, name")
    .eq("clinic_id", input.clinic.id)
    .eq("id", rawDoctor)
    .eq("is_visible", true)
    .maybeSingle();
  if (!doctor) return false;

  const next: SessionStateShape = {
    ...ctx.session,
    flow: { ...flow, step: "date", doctorId: doctor.id, doctorName: doctor.name },
  };
  await sendDateStep(input, ctx.conversation.id, next);
  return true;
}

async function handleDateTap(
  input: ProcessInboundInput,
  ctx: TapContext,
  date: string,
): Promise<boolean> {
  const flow = ctx.session.flow;
  if (!flow?.serviceId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const result = await listAvailableSlots(
    input.supabase,
    { id: input.clinic.id, timezone: input.clinic.timezone },
    flow.serviceId,
    date,
    undefined,
    flow.doctorId ?? null,
  );

  if (!result.ok || result.slots.length === 0) {
    await persistAndReply(input, ctx.conversation.id, { ...ctx.session, flow }, [
      `I'm sorry, ${input.clinic.name} has no open times on that day. Please pick another date:`,
    ], {
      list: {
        body: "Available dates",
        buttonText: "Pick a date",
        rows: buildDateRows(),
      },
    });
    return true;
  }

  const rows: WhatsappListRow[] = result.slots.slice(0, 10).map((start) => ({
    id: `slot:${start.slice(11, 16)}`,
    title: start.slice(11, 16),
    description: "available",
  }));

  await persistAndReply(
    input,
    ctx.conversation.id,
    { ...ctx.session, flow: { ...flow, step: "slot", date } },
    [`Here are the open times on ${formatNaive(`${date}T00:00`)}:`],
    {
      list: {
        body: `Available times for ${flow.serviceName}`,
        buttonText: "Pick a time",
        rows,
      },
    },
  );
  return true;
}

async function handleSlotTap(
  input: ProcessInboundInput,
  ctx: TapContext,
  time: string,
): Promise<boolean> {
  const flow = ctx.session.flow;
  if (!flow?.serviceId || !flow.date || !/^\d{2}:\d{2}$/.test(time)) return false;

  // Re-verify the slot at tap time — lists go stale.
  const result = await listAvailableSlots(
    input.supabase,
    { id: input.clinic.id, timezone: input.clinic.timezone },
    flow.serviceId,
    flow.date,
    undefined,
    flow.doctorId ?? null,
  );
  if (!result.ok || !result.slots.includes(`${flow.date}T${time}`)) {
    const next: SessionStateShape = {
      ...ctx.session,
      flow: { ...flow, step: "date", slot: undefined },
    };
    await persistAndReply(input, ctx.conversation.id, next, [
      "I'm sorry, that time was just taken. Please choose another date:",
    ], {
      list: {
        body: "Available dates",
        buttonText: "Pick a date",
        rows: buildDateRows(),
      },
    });
    return true;
  }

  // Ask the clinic's configured during-booking questions (if any) BEFORE the
  // confirmation ask — one numbered question per message, answered by plain
  // free text in order.
  const duringQuestions = await getActivePreConsultationQuestions(
    input.supabase,
    input.clinic.id,
    { serviceId: flow.serviceId, doctorId: flow.doctorId ?? null, timing: "during_booking" },
  );
  if (duringQuestions.length > 0) {
    const preConsult: PreConsultTracking = {
      questions: duringQuestions.map((question) => ({
        id: question.id,
        text: question.question_text,
      })),
      answers: {},
      index: 0,
    };
    const next: SessionStateShape = {
      ...ctx.session,
      flow: { ...flow, step: "preconsult", slot: time, preConsult },
    };
    await persistAndReply(input, ctx.conversation.id, next, [
      "Before we confirm — a few quick questions:",
      `1. ${preConsult.questions[0].text}`,
      'Reply "skip" to any you would rather not answer.',
    ]);
    return true;
  }

  const chosen: FlowState = { ...flow, step: "confirm", slot: time };
  if (ctx.matchedPatient || ctx.conversation.patient_id) {
    const next: SessionStateShape = { ...ctx.session, flow: chosen };
    await sendBookingConfirmationAsk(input, ctx.conversation.id, next);
    return true;
  }

  await persistAndReply(input, ctx.conversation.id, { ...ctx.session, flow: chosen }, [
    `Great — ${formatNaive(`${flow.date}T${time}`)} is available. What is your full name?`,
  ]);
  return true;
}

async function sendBookingConfirmationAsk(
  input: ProcessInboundInput,
  conversationId: string,
  nextState: SessionStateShape,
): Promise<void> {
  const flow = nextState.flow;
  if (!flow) return;
  await persistAndReply(input, conversationId, nextState, [summaryLine(input.clinic.name, flow)], {
    buttons: {
      body: "Shall I book this for you?",
      buttons: [
        { id: "bk-yes", title: "Confirm booking" },
        { id: "bk-no", title: "Cancel" },
      ],
    },
  });
}

function summaryLine(clinicName: string, flow: FlowState): string {
  const parts = [
    "Please confirm your appointment",
    `Service: ${flow.serviceName ?? ""}`.trim(),
    `When: ${flow.date && flow.slot ? formatNaive(`${flow.date}T${flow.slot}`) : ""}`,
    flow.doctorName ? `Doctor: ${flow.doctorName}` : "",
    `Clinic: ${clinicName}`,
  ].filter(Boolean);
  return parts.join("\n");
}

// ── Booking commit (same shared service the createAppointment tool uses) ────

async function confirmBooking(
  input: ProcessInboundInput,
  ctx: TapContext,
): Promise<void> {
  const flow = ctx.session.flow;
  if (!flow?.serviceId || !flow.date || !flow.slot) {
    await runAiTurn(input, ctx);
    return;
  }

  const existingPatientId =
    ctx.matchedPatient?.id ?? ctx.conversation.patient_id ?? undefined;
  const preConsultationAnswers = (flow.preConsult?.questions ?? [])
    // Preserve the configured question order.
    .filter((question) => flow.preConsult?.answers[question.id])
    .map((question) => ({
      questionId: question.id,
      answerText: flow.preConsult!.answers[question.id],
    }));
  const baseBooking = {
    serviceId: flow.serviceId,
    doctorId: flow.doctorId ?? undefined,
    start: `${flow.date}T${flow.slot}`,
    bookingSource: "ai_agent",
    ...(preConsultationAnswers.length > 0
      ? { preConsultationAnswers }
      : {}),
  } as const;
  const result = await createAppointmentService(
    input.supabase,
    { id: input.clinic.id, timezone: input.clinic.timezone },
    existingPatientId
      ? {
          ...baseBooking,
          patientId: existingPatientId,
        }
      : {
          ...baseBooking,
          patient: {
            name: flow.patientName ?? "",
            email: flow.patientEmail ?? null,
            phone: input.inbound.fromWaId,
          },
        },
  );

  if (!result.ok) {
    // Honest failure — never claim success. Offer fresh dates immediately.
    await persistAndReply(
      input,
      ctx.conversation.id,
      { ...ctx.session, flow: { ...flow, step: "date", slot: undefined } },
      [
        `I'm sorry, I couldn't complete that booking (${result.message}) Here are other dates you can try:`,
      ],
      {
        list: {
          body: "Available dates",
          buttonText: "Pick a date",
          rows: buildDateRows(),
        },
      },
    );
    return;
  }

  // Success: deterministic confirmation, thread↔patient link, number capture.
  await linkThreadToPatient(input, ctx, result.appointment.patient_id);

  // The booking service fired the after-booking follow-up to the patient; mark
  // the thread so their replies are captured deterministically afterwards.
  const pending = await buildPendingFollowUpState(
    input.supabase,
    input.clinic.id,
    result.appointment.id,
  );

  const confirmation = [
    "Your appointment is booked.",
    `Service: ${flow.serviceName}`,
    `When: ${formatNaive(`${flow.date}T${flow.slot}`)}`,
    flow.doctorName ? `Doctor: ${flow.doctorName}` : "",
    `Clinic: ${input.clinic.name}`,
    "You can reply here anytime if you need to reschedule or cancel.",
  ]
    .filter(Boolean)
    .join("\n");

  await persistAndReply(
    input,
    ctx.conversation.id,
    clearFlow({
      ...ctx.session,
      lastAppointmentId: result.appointment.id,
      ...(pending ? { pendingFollowUp: pending } : {}),
    }),
    [confirmation],
  );
}

/** Link the thread + capture the WhatsApp number on the patient record. */
async function linkThreadToPatient(
  input: ProcessInboundInput,
  ctx: TapContext,
  patientId: string,
): Promise<void> {
  const { supabase, clinic } = input;
  try {
    if (ctx.conversation.patient_id !== patientId) {
      await supabase
        .from("whatsapp_conversations")
        .update({ patient_id: patientId })
        .eq("id", ctx.conversation.id);
      ctx.conversation.patient_id = patientId;
    }
    await supabase
      .from("patients")
      .update({ whatsapp_number: input.inbound.fromWaId })
      .eq("clinic_id", clinic.id)
      .eq("id", patientId)
      .is("whatsapp_number", null);
  } catch (error) {
    console.error("[whatsapp-adapter] patient linking failed", error);
  }
}

// ── Shared AI orchestrator path (open-ended input) ──────────────────────────

async function runAiTurn(
  input: ProcessInboundInput,
  ctx: TapContext,
): Promise<void> {
  const { supabase, clinic, settings, credentials, inbound } = input;

  // Free text while collecting the patient's name/email is intake, not chat.
  if (ctx.session.pendingFollowUp && inbound.kind === "text" && inbound.text) {
    await captureFollowUpAnswer(input, ctx, inbound.text);
    return;
  }
  if (ctx.session.flow?.step === "preconsult" && inbound.kind === "text" && inbound.text) {
    await handlePreConsultText(input, ctx, inbound.text);
    return;
  }
  if (ctx.session.flow?.step === "name" && inbound.kind === "text" && inbound.text) {
    await handleIntakeText(input, ctx, inbound.text);
    return;
  }
  if (ctx.session.flow?.step === "email" && inbound.kind === "text" && inbound.text) {
    await handleIntakeText(input, ctx, inbound.text);
    return;
  }
  if (ctx.session.flow?.step === "confirm" && inbound.kind === "text") {
    // Ambiguous words while awaiting Confirm/Cancel → drop the pending draft
    // and let the AI respond to whatever they actually said.
    ctx.session = clearFlow(ctx.session);
    await saveSessionState(supabase, ctx.conversation.id, ctx.session);
  }

  const ruleViews = await loadWorkingHours(supabase, clinic.id);
  const context: ReceptionistContext = {
    clinic: {
      name: clinic.name,
      doctor_name: clinic.doctor_name,
      phone: clinic.phone,
      email: clinic.email,
      address: clinic.address,
    },
    workingHoursSummary: buildWorkingHoursSummary(ruleViews),
    settings,
  };
  const toolContext: ToolContext = {
    supabase,
    clinic: { id: clinic.id, timezone: clinic.timezone },
    settings,
    bookingSource: "ai_agent",
  };

  let provider;
  try {
    provider = await resolveProviderForClinic(clinic.id);
  } catch {
    await sendDeterministicReplies(credentials, inbound.fromWaId, [
      "I'm sorry, the assistant isn't available right now. Please try again later.",
    ]);
    return;
  }

  const history = await buildOrchestratorHistory(
    supabase,
    ctx.conversation.id,
    {
      matchedPatient:
        ctx.matchedPatient ??
        (ctx.conversation.patient_id
          ? await fetchPatientName(supabase, clinic.id, ctx.conversation.patient_id)
          : null),
      waId: inbound.fromWaId,
      clinicId: clinic.id,
      timezone: clinic.timezone,
      session: ctx.session,
    },
  );

  try {
    const result = await runReceptionistTurn({
      supabase,
      provider,
      context,
      toolContext,
      history,
      sessionId: ctx.conversation.id,
    });

    await applyTurnResult(input, ctx, result);
  } catch (error) {
    if (error instanceof ReceptionistProviderError) {
      console.error("[whatsapp-adapter] provider error", error.message);
    }
    await sendDeterministicReplies(credentials, inbound.fromWaId, [
      "Sorry — something went wrong on my side. Please try again in a moment.",
    ]);
  }
}

/** Translate one orchestrator turn into WhatsApp messages + state updates. */
async function applyTurnResult(
  input: ProcessInboundInput,
  ctx: TapContext,
  result: Awaited<ReturnType<typeof runReceptionistTurn>>,
): Promise<void> {
  const { clinic } = input;
  const sessionNext: SessionStateShape = { ...ctx.session };

  if (result.component?.type === "confirmation") {
    const booking = result.component.data;
    sessionNext.lastAppointmentId = booking.id;
    delete sessionNext.flow;
    if (booking.patientId) {
      await linkThreadToPatient(input, ctx, booking.patientId);
    }
    // The booking service already fired the after-booking WhatsApp follow-up;
    // mark the thread so the patient's next free-text replies are captured
    // as answers before any normal conversation resumes.
    const pending = await buildPendingFollowUpState(
      input.supabase,
      clinic.id,
      booking.id,
    );
    if (pending) sessionNext.pendingFollowUp = pending;
    const lines = [
      "Your appointment is booked.",
      `When: ${formatNaive(booking.startTime)}`,
      `Clinic: ${clinic.name}`,
      "You can reply here anytime if you need to reschedule or cancel.",
    ];
    await persistOutboundAndState(input, ctx.conversation.id, lines, sessionNext);
    return;
  }

  if (result.component?.type === "serviceList") {
    sessionNext.flow = {
      ...(sessionNext.flow ?? { step: "service" }),
      step: "service",
    };
    const rows = result.component.data.map((service) => ({
      id: `svc:${service.id}`,
      title: service.name,
      description: `${service.durationMinutes} min`,
    }));
    await persistOutboundAndState(
      input,
      ctx.conversation.id,
      [result.caption ?? "Here are our services:"],
      sessionNext,
      {
        list: {
          body: "Which service would you like?",
          buttonText: "View services",
          header: "Our services",
          rows,
        },
      },
    );
    return;
  }

  if (result.component?.type === "slotList" && result.component.data.length > 0) {
    const slots = result.component.data;
    const date =
      result.availability?.date ??
      ctx.session.flow?.date ??
      slots[0].startTime.slice(0, 10);
    const serviceId =
      result.availability?.serviceId ?? ctx.session.flow?.serviceId;
    const doctorId =
      result.availability?.doctorId !== undefined
        ? result.availability.doctorId
        : (ctx.session.flow?.doctorId ?? null);
    sessionNext.flow = {
      ...(sessionNext.flow ?? {}),
      step: "slot",
      date,
      ...(serviceId ? { serviceId, serviceName: ctx.session.flow?.serviceName } : {}),
      doctorId,
    };
    const rows = slots.slice(0, 10).map((slot) => ({
      id: `slot:${slot.startTime.slice(11, 16)}`,
      title: slot.startTime.slice(11, 16),
      description: "available",
    }));
    await persistOutboundAndState(
      input,
      ctx.conversation.id,
      [result.caption ?? "Here are the available times:"],
      sessionNext,
      {
        list: {
          body: `Available times on ${formatNaive(`${date}T00:00`)}`,
          buttonText: "Pick a time",
          rows,
        },
      },
    );
    return;
  }

  // Plain conversational reply.
  await persistOutboundAndState(input, ctx.conversation.id, [result.reply], sessionNext);
}

// ── Intake (new patients) ───────────────────────────────────────────────────

async function handleIntakeText(
  input: ProcessInboundInput,
  ctx: TapContext,
  text: string,
): Promise<void> {
  const flow = ctx.session.flow;
  if (!flow) return;

  if (flow.step === "name") {
    const name = text.replace(/\s+/g, " ").trim().slice(0, 120);
    if (name.length < 2 || /@/.test(name)) {
      await persistAndReply(input, ctx.conversation.id, ctx.session, [
        "Could you please share your full name so I can book that for you?",
      ]);
      return;
    }
    const required = input.settings?.required_patient_fields ?? ["name"];
    if (required.includes("email")) {
      await persistAndReply(input, ctx.conversation.id, { ...ctx.session, flow: { ...flow, step: "email", patientName: name } }, [
        `Thank you, ${name}. What email address should we use for your booking?`,
      ]);
      return;
    }
    const next: SessionStateShape = {
      ...ctx.session,
      flow: { ...flow, step: "confirm", patientName: name },
    };
    await sendBookingConfirmationAsk(input, ctx.conversation.id, next);
    return;
  }

  if (flow.step === "email") {
    const email = text.trim().slice(0, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await persistAndReply(input, ctx.conversation.id, ctx.session, [
        "That doesn't look like a valid email address. Could you check it and send it again?",
      ]);
      return;
    }
    const next: SessionStateShape = {
      ...ctx.session,
      flow: { ...flow, step: "confirm", patientEmail: email },
    };
    await sendBookingConfirmationAsk(input, ctx.conversation.id, next);
  }
}

// ── Pre-consultation (Phase 22) ────────────────────────────────────────────

/**
 * Consume one free-text reply against the during-booking question currently
 * being asked (tap-driven flow). Stores the answer keyed by question id,
 * moves to the next question, or — when all are answered — resumes the normal
 * booking tail (confirmation ask for known patients, name intake otherwise).
 */
async function handlePreConsultText(
  input: ProcessInboundInput,
  ctx: TapContext,
  text: string,
): Promise<void> {
  const flow = ctx.session.flow;
  const pre = flow?.preConsult;
  if (!flow || !pre) return;

  const answerText = text.replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!answerText) {
    await persistAndReply(input, ctx.conversation.id, ctx.session, [
      `Please send your answer to: ${pre.questions[pre.index].text}`,
    ]);
    return;
  }

  const answers = { ...pre.answers, [pre.questions[pre.index].id]: answerText };
  const nextIndex = pre.index + 1;
  if (nextIndex < pre.questions.length) {
    const next: SessionStateShape = {
      ...ctx.session,
      flow: { ...flow, preConsult: { ...pre, answers, index: nextIndex } },
    };
    await persistAndReply(input, ctx.conversation.id, next, [
      "Got it, thank you.",
      `${nextIndex + 1}. ${pre.questions[nextIndex].text}`,
    ]);
    return;
  }

  const completed: FlowState = {
    ...flow,
    step: "confirm",
    preConsult: { ...pre, answers },
  };
  if (ctx.matchedPatient || ctx.conversation.patient_id) {
    await sendBookingConfirmationAsk(input, ctx.conversation.id, {
      ...ctx.session,
      flow: completed,
    });
    return;
  }
  await persistAndReply(
    input,
    ctx.conversation.id,
    { ...ctx.session, flow: completed },
    ["Thank you! Please confirm — what is your full name?"],
  );
}

/**
 * Consume one free-text reply as the next after-booking answer, in the order
 * the questions were asked in the follow-up message. Each reply answers one
 * question; the entire free-text message is that answer (verbatim, trimmed).
 * Answer capture is strictly sequential and deterministic — no LLM. Interactive
 * taps bypass capture entirely and resume normal conversation.
 */
async function captureFollowUpAnswer(
  input: ProcessInboundInput,
  ctx: TapContext,
  text: string,
): Promise<void> {
  const pending = ctx.session.pendingFollowUp;
  if (!pending) return;

  const answerText = text.replace(/\s+/g, " ").trim().slice(0, 2000);
  const stored = await recordPreConsultationAnswers(input.supabase, input.clinic.id, pending.appointmentId, [
    { questionId: pending.questionIds[pending.nextIndex], answerText },
  ]);
  if (!stored.ok) {
    console.warn("[whatsapp-adapter] follow-up answer not stored", {
      appointmentId: pending.appointmentId,
      index: pending.nextIndex,
    });
  }

  const nextIndex = pending.nextIndex + 1;
  if (nextIndex < pending.questionIds.length) {
    ctx.session.pendingFollowUp = { ...pending, nextIndex };
    await saveSessionState(input.supabase, ctx.conversation.id, ctx.session);
    await persistAndReply(input, ctx.conversation.id, null, [
      `Got it. Please send your answer to question ${nextIndex + 1} when ready.`,
    ]);
    return;
  }

  delete ctx.session.pendingFollowUp;
  await saveSessionState(input.supabase, ctx.conversation.id, ctx.session);
  await persistAndReply(input, ctx.conversation.id, null, [
    "Thank you — the clinic has received your answers. Is there anything else I can help you with?",
  ]);
}

// ── History construction ────────────────────────────────────────────────────

async function loadWorkingHours(
  supabase: SupabaseClient<Database>,
  clinicId: string,
): Promise<RuleView[]> {
  const { data } = await supabase
    .from("availability_rules")
    .select("day_of_week, start_time, end_time, enabled")
    .eq("clinic_id", clinicId)
    .is("doctor_id", null)
    .order("day_of_week", { ascending: true });
  return (data ?? []).map((rule) => ({
    dayOfWeek: rule.day_of_week,
    startTime: rule.start_time,
    endTime: rule.end_time,
    enabled: rule.enabled,
  }));
}

async function fetchPatientName(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
): Promise<MatchedPatient | null> {
  const { data } = await supabase
    .from("patients")
    .select("id, name, email")
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .maybeSingle();
  return data ?? null;
}

type HistoryContext = {
  matchedPatient: MatchedPatient | null;
  waId: string;
  clinicId: string;
  timezone: string;
  session: SessionStateShape;
};

/**
 * Build orchestrator history from the persistent thread log (patient → user;
 * ai/staff → assistant), then inject synthetic context pairs — the same trick
 * the widget uses client-side with `sessionContext`, moved server-side here:
 * returning-patient identity and known upcoming appointments (so reschedule/
 * cancel can identify targets across sessions, Phase 6 safety preserved).
 */
async function buildOrchestratorHistory(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  hc: HistoryContext,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const thread = await getRecentMessages(supabase, conversationId, 30);
  const mapped = thread.map((m) => ({
    role: (m.senderType === "patient" ? "user" : "assistant") as
      | "user"
      | "assistant",
    content:
      m.senderType === "staff" && m.senderName
        ? `[Clinic staff member]: ${m.content}`
        : m.content,
  }));

  const contextLines: string[] = [];
  if (hc.matchedPatient) {
    contextLines.push(
      `[System: You are chatting on WhatsApp with ${hc.matchedPatient.name}, an existing patient of this clinic. Their WhatsApp number is ${hc.waId}. Do not ask for their name or contact details again — you already know them.]`,
    );
  }
  const upcoming = await upcomingAppointmentsForContext(supabase, hc);
  if (upcoming) contextLines.push(upcoming);

  if (contextLines.length === 0) return mapped;

  const withContext: Array<{ role: "user" | "assistant"; content: string }> = [];
  const current = mapped[mapped.length - 1];
  const prior = mapped.slice(0, -1);
  withContext.push(...prior);
  withContext.push({ role: "user", content: contextLines.join("\n") });
  withContext.push({
    role: "assistant",
    content: "Understood. I have noted the patient details.",
  });
  if (current) withContext.push(current);
  return withContext;
}

async function upcomingAppointmentsForContext(
  supabase: SupabaseClient<Database>,
  hc: HistoryContext,
): Promise<string | null> {
  const patientId = hc.matchedPatient?.id;
  const lastId = hc.session.lastAppointmentId;
  if (!patientId && !lastId) return null;

  const query = supabase
    .from("appointments")
    .select("id, start_time, status, services(name)")
    .eq("clinic_id", hc.clinicId)
    .in("status", ["pending", "confirmed"])
    .gte("start_time", new Date().toISOString())
    .order("start_time", { ascending: true })
    .limit(3);
  if (patientId) {
    query.eq("patient_id", patientId);
  } else {
    query.eq("id", lastId as string);
  }
  const { data } = await query;
  const rows = (data ?? []) as Array<{
    id: string;
    start_time: string;
    services: { name: string } | { name: string }[] | null;
  }>;
  if (rows.length === 0) return null;

  const lines = rows.map((row) => {
    const serviceRaw = row.services;
    const serviceName = Array.isArray(serviceRaw)
      ? serviceRaw[0]?.name
      : serviceRaw?.name;
    const when = formatNaive(
      utcToClinicLocal(row.start_time, hc.timezone),
    );
    return `- ID ${row.id}: ${serviceName ?? "appointment"} on ${when}`;
  });
  return `[System: This patient's upcoming appointments:\n${lines.join("\n")}\nIf they ask to change or cancel one of these, confirm WHICH appointment before calling rescheduleAppointment or cancelAppointment with its ID. Never create a new appointment as a substitute.]`;
}

function utcToClinicLocal(iso: string, tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const values: Record<string, string> = {};
    for (const part of formatter.formatToParts(new Date(iso))) {
      if (part.type !== "literal") values[part.type] = part.value;
    }
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
  } catch {
    return iso;
  }
}

// ── Send + persistence plumbing ─────────────────────────────────────────────

async function sendDateStep(
  input: ProcessInboundInput,
  conversationId: string,
  nextState: SessionStateShape,
): Promise<void> {
  await persistAndReply(input, conversationId, nextState, ["Great choice. Which day works for you?"], {
    list: {
      body: "Available dates",
      buttonText: "Pick a date",
      rows: buildDateRows(),
    },
  });
}

type ExtraMessage =
  | { list: { body: string; buttonText: string; rows: WhatsappListRow[]; header?: string } }
  | { buttons: { body: string; buttons: Array<{ id: string; title: string }> } };

/** Log outbound texts to the thread, update state, deliver everything. */
async function persistAndReply(
  input: ProcessInboundInput,
  conversationId: string,
  nextState: SessionStateShape | null,
  texts: string[],
  extra?: ExtraMessage,
): Promise<void> {
  if (nextState) {
    await saveSessionState(input.supabase, conversationId, nextState);
  }
  await persistOutboundAndState(input, conversationId, texts, null, extra);
}

async function persistOutboundAndState(
  input: ProcessInboundInput,
  conversationId: string,
  texts: string[],
  nextState: SessionStateShape | null,
  extra?: ExtraMessage,
): Promise<void> {
  if (nextState) {
    await saveSessionState(input.supabase, conversationId, nextState);
  }
  const delivered: string[] = [];
  for (const text of texts) {
    if (!text.trim()) continue;
    const result = await sendWhatsappText(
      input.credentials,
      input.inbound.fromWaId,
      text,
    );
    if (result.ok) delivered.push(text);
    else {
      console.error("[whatsapp-adapter] text send failed", result.error);
      return; // Don't log messages that never reached Meta.
    }
  }
  if (extra && "list" in extra) {
    const result = await sendWhatsappList(
      input.credentials,
      input.inbound.fromWaId,
      extra.list,
    );
    if (!result.ok) {
      console.error("[whatsapp-adapter] list send failed", result.error);
    }
  }
  if (extra && "buttons" in extra) {
    const result = await sendWhatsappButtons(
      input.credentials,
      input.inbound.fromWaId,
      extra.buttons,
    );
    if (!result.ok) {
      console.error("[whatsapp-adapter] buttons send failed", result.error);
    }
  }
  for (const text of delivered) {
    await logWhatsappMessage(input.supabase, {
      conversationId,
      clinicId: input.clinic.id,
      senderType: "ai",
      content: text,
    });
  }
  await touchConversation(input.supabase, {
    conversationId,
    preview: delivered[delivered.length - 1] ?? "(options)",
    senderType: "ai",
  });
}

async function sendDeterministicReplies(
  credentials: WhatsappCredentials,
  to: string,
  texts: string[],
): Promise<void> {
  for (const text of texts) {
    const result = await sendWhatsappText(credentials, to, text);
    if (!result.ok) {
      console.error("[whatsapp-adapter] fallback send failed", result.error);
      return;
    }
  }
}
