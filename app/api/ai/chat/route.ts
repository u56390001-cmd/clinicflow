import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { buildWorkingHoursSummary, type RuleView } from "@/lib/appointments-view";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { resolveProviderForClinic } from "@/lib/ai/provider";
import {
  ReceptionistProviderError,
  runReceptionistTurn,
} from "@/lib/ai/orchestrator";
import { checkRateLimit, envInt } from "@/lib/ai/rate-limit";
import type { ReceptionistContext } from "@/lib/ai/system-prompt";
import type { ToolContext } from "@/lib/ai/tools";
import { createClient } from "@/lib/supabase/server";

/**
 * Internal AI Receptionist chat endpoint (Phase 5). Restricted to the
 * signed-in clinic's owner/admin (the tester), rate-limited per user + IP, and
 * scoped to the session clinic. The public widget is the next phase — this
 * route stays authenticated forever.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const WINDOW_MS = 60_000;

const chatRequestSchema = z.object({
  sessionId: z.string().uuid("Invalid session id."),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1, "A message can't be empty.").max(4000),
      }),
    )
    .min(1)
    .max(60),
});

type ChatBody = z.infer<typeof chatRequestSchema>;

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = chatRequestSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (body.messages[body.messages.length - 1].role !== "user") {
    return NextResponse.json(
      { ok: false, error: "The last message must come from the user." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to use the AI receptionist." }, { status: 401 });
  }

  const access = await getCurrentClinic(supabase);
  if (!access) {
    return NextResponse.json({ ok: false, error: "You must have a clinic to use the AI receptionist." }, { status: 403 });
  }
  if (!canWriteClinic(access.role)) {
    return NextResponse.json({ ok: false, error: "Only the clinic owner or an admin can use the AI receptionist." }, { status: 403 });
  }

  const userLimit = envInt("AI_CHAT_RATE_LIMIT", 30);
  const userRate = checkRateLimit(`ai:user:${user.id}`, userLimit, WINDOW_MS);
  if (!userRate.ok) {
    return NextResponse.json(
      { ok: false, error: "You're sending messages too quickly. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(userRate.retryAfterSeconds) } },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipLimit = envInt("AI_CHAT_IP_RATE_LIMIT", 60);
  const ipRate = checkRateLimit(`ai:ip:${ip}`, ipLimit, WINDOW_MS);
  if (!ipRate.ok) {
    return NextResponse.json(
      { ok: false, error: "You're sending messages too quickly. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(ipRate.retryAfterSeconds) } },
    );
  }

  const [settingsResult, rulesResult] = await Promise.all([
    supabase
      .from("clinic_ai_settings")
      .select("*")
      .eq("clinic_id", access.clinic.id)
      .maybeSingle(),
    supabase
      .from("availability_rules")
      .select("day_of_week, start_time, end_time, enabled")
      // Clinic-wide defaults only — per-doctor overrides are not general hours.
      .eq("clinic_id", access.clinic.id)
      .is("doctor_id", null)
      .order("day_of_week", { ascending: true }),
  ]);

  const settings = settingsResult.data ?? null;
  const ruleViews: RuleView[] = (rulesResult.data ?? []).map((rule) => ({
    dayOfWeek: rule.day_of_week,
    startTime: rule.start_time,
    endTime: rule.end_time,
    enabled: rule.enabled,
  }));

  const context: ReceptionistContext = {
    clinic: {
      name: access.clinic.name,
      doctor_name: access.clinic.doctor_name,
      phone: access.clinic.phone,
      email: access.clinic.email,
      address: access.clinic.address,
    },
    workingHoursSummary: buildWorkingHoursSummary(ruleViews),
    settings,
  };

  const toolContext: ToolContext = {
    supabase,
    clinic: { id: access.clinic.id, timezone: access.clinic.timezone },
    settings,
  };

  let provider;
  try {
    provider = await resolveProviderForClinic(access.clinic.id);
  } catch {
    return NextResponse.json(
      { ok: false, error: "The AI receptionist isn't configured on this server yet." },
      { status: 500 },
    );
  }

  try {
    const result = await runReceptionistTurn({
      supabase,
      provider,
      context,
      toolContext,
      history: body.messages,
      sessionId: body.sessionId,
    });
    return NextResponse.json({
      ok: true,
      reply: result.reply,
      outcome: result.outcome,
      bookingAttempted: result.bookingAttempted,
      caption: result.caption,
      component: result.component,
      sessionContext: result.sessionContext,
    });
  } catch (error) {
    if (error instanceof ReceptionistProviderError) {
      console.error(
        "[api/ai/chat] receptionist provider error",
        error.cause ?? error,
      );
      const raw =
        error.cause instanceof Error
          ? error.cause.message
          : typeof error.cause === "string"
            ? error.cause
            : "";
      const retryDelay = /"retryDelay"\s*:\s*"(\d+)s"/.exec(raw);
      const isDailyQuota =
        retryDelay && Number(retryDelay[1]) >= 60;
      if (isDailyQuota) {
        console.warn("[api/ai/chat] daily quota exhausted — returning quota message");
      }
      return NextResponse.json(
        {
          ok: false,
          error: isDailyQuota
            ? "The AI assistant has reached its usage limit for today. Please try again later."
            : "The AI assistant is temporarily busy. Please wait a moment and try again.",
        },
        { status: 502 },
      );
    }
    console.error("[api/ai/chat] unexpected error", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
