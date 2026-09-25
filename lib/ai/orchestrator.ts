import type {
  AIChatMessage,
  AIProvider,
} from "@/lib/ai/types";
import { AI_TOOLS, type ToolContext } from "@/lib/ai/tools";
import {
  MEDICAL_ESCALATION_MARKER,
  type ReceptionistContext,
  buildSystemPrompt,
} from "@/lib/ai/system-prompt";
import { logAiConversationTurn } from "@/lib/ai/logging";
import type { AiConversationOutcome, Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Maximum tool-call rounds before we stop and answer with what we have. */
const MAX_ROUNDS = 8;

const ESCALATION_OUTCOME: AiConversationOutcome = "escalated";
const FAILED_OUTCOME: AiConversationOutcome = "failed";
const SUCCESS_OUTCOME: AiConversationOutcome = "success";

/** Raised when the model provider itself fails. The route maps this to a 502
 * and logs the turn as `failed`. */
export class ReceptionistProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReceptionistProviderError";
  }
}

export type ReceptionistTurnInput = {
  supabase: SupabaseClient<Database>;
  /** Clinic context for the system prompt (name, contact, working hours). */
  context: ReceptionistContext;
  /** Runtime context for tool execution (pinned clinic + settings). */
  toolContext: ToolContext;
  /** Full message history from the client. Last message must be from the user. */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  sessionId: string;
  provider: AIProvider;
};

/** Component types the widget can render as structured UI. */
export type WidgetComponentType = "serviceList" | "slotList" | "confirmation";

/** A structured UI component sourced directly from tool-call results,
 *  completely independent of the model's text output. */
export type WidgetComponent =
  | { type: "serviceList"; data: WidgetServiceListData }
  | { type: "slotList"; data: WidgetSlotListData }
  | { type: "confirmation"; data: WidgetConfirmationData };

export type WidgetServiceListData = Array<{
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
}>;

export type WidgetSlotListData = Array<{
  startTime: string;
  endTime: string;
}>;

export type WidgetConfirmationData = {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  serviceName?: string;
  /** Lets non-widget channels link the thread to the patient record that was
   *  created/matched by the booking. Unused by the widget UI. */
  patientId?: string;
};

export type ReceptionistTurnResult = {
  reply: string;
  outcome: AiConversationOutcome;
  bookingAttempted: boolean;
  error?: string;
  /** Deterministic caption template for the frontend to use as the chat bubble
   *  text when a component is present. Sourced from tool-call results, not from
   *  the model's free text. Falls through to `reply` when no component exists. */
  caption?: string;
  /** Structured UI component sourced directly from tool-call results.
   *  The frontend renders this as dedicated UI (cards, buttons, etc.)
   *  independent of whatever text the model also produced. */
  component?: WidgetComponent;
  /** Context string the frontend should inject into the conversation so the AI
   *  can reference booked appointments in subsequent turns (reschedule/cancel). */
  sessionContext?: string;
  /** The exact arguments behind the most recent successful getAvailability
   *  call this turn. Lets non-widget channels handle a slot selection
   *  deterministically (calling the booking services directly) without
   *  re-interpreting anything. Unused by the widget. */
  availability?: {
    serviceId: string;
    doctorId?: string | null;
    date: string;
  };
};

type ToolOutcomeFlags = {
  created: boolean;
  rescheduled: boolean;
  cancelled: boolean;
  failed: boolean;
};

/**
 * Claims that must be backed by a successful tool result this turn. Guarding
 * these in code (not just in the prompt) is what makes the "never claim a
 * booking that wasn't made" rule enforceable.
 */
const CLAIM_BOOKING =
  /\b(appointment|booking)\b[^.!?\n]{0,60}\b(booked|confirmed|scheduled|set)\b|\b(booked|confirmed)\b[^.!?\n]{0,60}\b(appointment|booking)\b/i;
const CLAIM_RESCHEDULE =
  /\b(appointment)\b[^.!?\n]{0,60}\b(rescheduled|moved)\b|\b(rescheduled|moved)\b[^.!?\n]{0,60}\b(appointment)\b/i;
const CLAIM_CANCEL =
  /\b(appointment)\b[^.!?\n]{0,60}\b(cancelled|canceled)\b|\b(cancelled|canceled)\b[^.!?\n]{0,60}\b(appointment)\b/i;

const BOOKING_OVERRIDE =
  "I'm sorry, I couldn't complete that booking. Please try a different time or contact the clinic directly.";
const RESCHEDULE_OVERRIDE =
  "I'm sorry, I couldn't reschedule that appointment. Please try a different time or contact the clinic directly.";
const CANCEL_OVERRIDE =
  "I'm sorry, I couldn't cancel that appointment. Please contact the clinic directly.";

/** Block message when createAppointment is called but user intent is reschedule/cancel. */
const RESCHEDULE_CANCEL_BLOCK =
  "It looks like you want to reschedule or cancel an existing appointment rather than create a new one. Could you tell me which appointment you'd like to change? Please provide the date and time of your existing booking so I can help.";

/**
 * Detect whether the user's recent messages indicate a reschedule or cancel
 * intent rather than a new booking request. Scans the last few user messages
 * for relevant keywords.
 */
function hasRescheduleOrCancelIntent(
  history: Array<{ role: "user" | "assistant"; content: string }>,
): boolean {
  const recentUserMessages = history
    .filter((m) => m.role === "user")
    .slice(-3);
  const combined = recentUserMessages
    .map((m) => m.content.toLowerCase())
    .join(" ");
  return /\b(cancel|reschedul|change\s+(my\s+)?appoint|move\s+(my\s+)?appoint|replace\s+(my\s+)?appoint|modify\s+(my\s+)?appoint)\b/.test(combined);
}

/**
 * Run one full receptionist turn against the provider: convert the history,
 * drive the function-call loop (bounded), apply the confirmation guardrails
 * to the final answer, and persist the conversation log. The clinic is pinned
 * by the caller from the signed-in tester's session; tools can never act on
 * another clinic.
 */
export async function runReceptionistTurn(
  input: ReceptionistTurnInput,
): Promise<ReceptionistTurnResult> {
  const { supabase, context, toolContext, history, sessionId, provider } = input;
  const { clinic } = toolContext;

  const contents = normalizeHistory(history);
  const systemInstruction = buildSystemPrompt(context);

  const flags: ToolOutcomeFlags = {
    created: false,
    rescheduled: false,
    cancelled: false,
    failed: false,
  };
  let bookingAttempted = false;
  let firstFailureMessage: string | undefined;
  let reply = "";
  const toolData: {
    slots?: Array<{ startTime: string; endTime: string }>;
    booking?: WidgetConfirmationData;
    services?: WidgetServiceListData;
    availability?: {
      serviceId: string;
      doctorId?: string | null;
      date: string;
    };
  } = {};

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let response;
    try {
      response = await provider.chat({
        systemInstruction,
        tools: AI_TOOLS,
        messages: contents,
      });
    } catch (error) {
      console.error("[ai/orchestrator] provider error", error);
      throw new ReceptionistProviderError(
        error instanceof Error ? error.message : "The AI service failed.",
        { cause: error },
      );
    }

    if (response.text) reply = response.text;

    if (!response.functionCalls || response.functionCalls.length === 0) {
      break;
    }

    // Detect reschedule/cancel intent from user history for the guard.
    const rescheduleCancelIntent = hasRescheduleOrCancelIntent(history);

    const toolResults = await Promise.all(
      response.functionCalls.map(async (call) => {
        const tool = AI_TOOLS.find((candidate) => candidate.name === call.name);
        if (!tool) {
          return { id: call.id, name: call.name, response: { ok: false, error: "Unknown tool." } };
        }

        // CODE-LEVEL GUARD: Block createAppointment when user intent is
        // reschedule/cancel. This prevents the AI from silently creating a
        // duplicate booking instead of rescheduling or cancelling an existing one.
        if (tool.name === "createAppointment" && rescheduleCancelIntent) {
          console.warn("[ai/orchestrator] BLOCKED createAppointment — reschedule/cancel intent detected");
          bookingAttempted = true;
          return {
            id: call.id,
            name: call.name,
            response: { ok: false, error: RESCHEDULE_CANCEL_BLOCK },
          };
        }

        if (tool.name === "createAppointment") bookingAttempted = true;
        let outcome;
        try {
          outcome = await tool.execute(toolContext, call.args);
        } catch (error) {
          outcome = {
            ok: false,
            error: error instanceof Error ? error.message : "Tool execution failed.",
          };
        }
        if (outcome && typeof outcome === "object" && "ok" in outcome && (outcome as { ok: boolean }).ok === false) {
          flags.failed = true;
          const message = (outcome as { error?: string }).error;
          if (!firstFailureMessage && message) firstFailureMessage = message;
        } else if (tool.name === "createAppointment") {
          flags.created = true;
          const out = outcome as Record<string, unknown>;
          if (out.ok === true && out.appointment) {
            const appt = out.appointment as Record<string, unknown>;
            toolData.booking = {
              id: appt.id as string,
              startTime: appt.start as string,
              endTime: appt.end as string,
              status: appt.status as string,
              ...(typeof appt.patientId === "string"
                ? { patientId: appt.patientId }
                : {}),
            };

            // Inject appointment context into the conversation so the AI can
            // reference this appointment later for reschedule/cancel requests.
            // This is a synthetic "system" message appended to the conversation
            // contents that the model will see in subsequent turns.
            const contextMsg = `[System: Appointment booked — ID: ${appt.id}, start: ${appt.start}, end: ${appt.end}, status: ${appt.status}. If the user later asks to reschedule or cancel, use this appointment ID with the rescheduleAppointment or cancelAppointment tool.]`;
            contents.push({
              role: "user",
              parts: [{ text: contextMsg }],
            });
            contents.push({
              role: "model",
              parts: [{ text: "Understood. I have noted the appointment details." }],
            });
          }
        } else if (tool.name === "getAvailability") {
          const out = outcome as Record<string, unknown>;
          if (out.ok === true && Array.isArray(out.slots)) {
            const duration = typeof out.durationMinutes === "number" ? out.durationMinutes : 30;
            toolData.slots = (out.slots as string[]).map((start) => ({
              startTime: start,
              endTime: addMinutesToNaiveLocal(start, duration),
            }));
            // Remember which query produced these slots so non-widget
            // channels can act on a slot tap deterministically.
            toolData.availability = {
              serviceId:
                typeof out.serviceId === "string"
                  ? out.serviceId
                  : String(call.args.serviceId ?? ""),
              doctorId:
                typeof call.args.doctorId === "string" && call.args.doctorId
                  ? call.args.doctorId
                  : null,
              date: typeof out.date === "string" ? out.date : String(call.args.date ?? ""),
            };
          }
        } else if (tool.name === "getServices") {
          const out = outcome as Record<string, unknown>;
          if (Array.isArray(out.services)) {
            toolData.services = (out.services as Record<string, unknown>[]).map((s) => ({
              id: s.id as string,
              name: s.name as string,
              description: (s.description as string) ?? null,
              durationMinutes: (s.durationMinutes as number) ?? 30,
              price: (s.price as number) ?? 0,
            }));
          }
        } else if (tool.name === "rescheduleAppointment") {
          flags.rescheduled = true;
        } else if (tool.name === "cancelAppointment") {
          flags.cancelled = true;
        }
        return { id: call.id, name: call.name, response: outcome };
      }),
    );

    contents.push({
      role: "model",
      parts: response.functionCalls.map((call) => ({
        functionCall: { id: call.id, name: call.name, args: call.args },
        thoughtSignature: call.thoughtSignature,
      })),
    });
    contents.push({
      role: "user",
      parts: toolResults.map((result) => ({
        functionResponse: {
          id: result.id,
          name: result.name,
          response: result.response,
        },
      })),
    });
  }

  reply = guardClaim(reply, flags);
  if (!reply) {
    reply =
      "I wasn't able to answer that just now. Please try again or contact the clinic directly.";
  }

  const escalated = reply
    .toLowerCase()
    .includes(MEDICAL_ESCALATION_MARKER.toLowerCase());
  const outcome: AiConversationOutcome = escalated
    ? ESCALATION_OUTCOME
    : flags.failed
      ? FAILED_OUTCOME
      : SUCCESS_OUTCOME;

  await logAiConversationTurn(supabase, {
    clinicId: clinic.id,
    sessionId,
    outcome,
    messageCount: history.length,
    bookingAttempted,
    error: escalated
      ? null
      : flags.failed
        ? firstFailureMessage ?? "A tool step failed."
        : null,
  });

  // Build structured component and deterministic caption from tool results.
  // The caption is a hardcoded template — NOT the model's free text — so it's
  // always minimal and never duplicates the component's data.
  let caption: string | undefined;
  let component: WidgetComponent | undefined;

  if (toolData.booking) {
    component = { type: "confirmation", data: toolData.booking };
    caption = "Your appointment is confirmed:";
  } else if (toolData.slots && toolData.slots.length > 0) {
    component = { type: "slotList", data: toolData.slots };
    caption = "Here are the available times:";
  } else if (toolData.services && toolData.services.length > 0) {
    component = { type: "serviceList", data: toolData.services };
    caption = "Here are our services:";
  }

  // Build session context for the frontend to inject into the conversation,
  // so the AI can reference booked appointments in subsequent turns.
  let sessionContext: string | undefined;
  if (toolData.booking) {
    const b = toolData.booking;
    sessionContext = `[Session context: Appointment booked — ID: ${b.id}, start: ${b.startTime}, end: ${b.endTime}, status: ${b.status}${b.serviceName ? `, service: ${b.serviceName}` : ""}. If the user later asks to reschedule or cancel, use this appointment ID with the rescheduleAppointment or cancelAppointment tool. Do NOT create a new appointment as a substitute.]`;
  }

  return {
    reply,
    outcome,
    bookingAttempted,
    error: firstFailureMessage,
    caption,
    component,
    sessionContext,
    availability: toolData.availability,
  };
}

/** Guard the final text against claiming work the tools did not actually do. */
function guardClaim(text: string, flags: ToolOutcomeFlags): string {
  if (!flags.created && CLAIM_BOOKING.test(text)) return BOOKING_OVERRIDE;
  if (!flags.rescheduled && CLAIM_RESCHEDULE.test(text)) return RESCHEDULE_OVERRIDE;
  if (!flags.cancelled && CLAIM_CANCEL.test(text)) return CANCEL_OVERRIDE;
  return text;
}

/**
 * Add minutes to a naive clinic-local `YYYY-MM-DDTHH:mm` string. Used to
 * compute slot end times from the start time + service duration. The input
 * and output are both naive wall-clock values — no timezone conversion needed.
 */
function addMinutesToNaiveLocal(naive: string, durationMinutes: number): string {
  const match = naive.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return naive;
  const [, datePart, h, m] = match;
  const totalMinutes = Number(h) * 60 + Number(m) + durationMinutes;
  const newH = Math.floor(totalMinutes / 60);
  const newM = totalMinutes % 60;
  return `${datePart}T${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

/** Map client history onto Gemini contents, enforcing a user-first start. */
function normalizeHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>,
): AIChatMessage[] {
  const contents: AIChatMessage[] = [];
  for (const message of history) {
    const text = message.content.trim();
    if (!text) continue;
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text }],
    });
  }
  while (contents.length > 0 && contents[0].role === "model") {
    contents.shift();
  }
  return contents;
}
