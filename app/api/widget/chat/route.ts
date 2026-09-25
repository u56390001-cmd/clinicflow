import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { buildWorkingHoursSummary, type RuleView } from "@/lib/appointments-view";
import { resolveProviderForClinic } from "@/lib/ai/provider";
import {
  ReceptionistProviderError,
  runReceptionistTurn,
} from "@/lib/ai/orchestrator";
import { checkRateLimit, envInt } from "@/lib/ai/rate-limit";
import type { ReceptionistContext } from "@/lib/ai/system-prompt";
import type { ToolContext } from "@/lib/ai/tools";
import { logAppEvent } from "@/lib/observability";
import { createWidgetClient } from "@/lib/supabase/widget";
import { CLINIC_SLUG_REGEX } from "@/lib/constants";

/**
 * Public AI Receptionist chat endpoint (Phase 6). Unauthenticated — any
 * website visitor can use this. Scoped to exactly one clinic via `slug`,
 * rate-limited per-IP and per-slug. Uses the service-role client with manual
 * clinic scoping (RLS is NOT loosened for anonymous access).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const WINDOW_MS = 60_000;

const chatRequestSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(CLINIC_SLUG_REGEX, "Invalid clinic identifier."),
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

/** Unified unavailable response — does NOT distinguish slug-not-found from
 *  slug-not-activated, to avoid slug enumeration. */
const UNAVAILABLE = {
  ok: false,
  error: "This clinic's AI assistant isn't available right now.",
} as const;

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

  // ── Rate limiting ──────────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipLimit = envInt("WIDGET_CHAT_IP_RATE_LIMIT", 20);
  const ipRate = checkRateLimit(`widget:ip:${ip}`, ipLimit, WINDOW_MS);
  if (!ipRate.ok) {
    return NextResponse.json(
      { ok: false, error: "You're sending messages too quickly. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(ipRate.retryAfterSeconds) } },
    );
  }

  const slugLimit = envInt("WIDGET_CHAT_SLUG_RATE_LIMIT", 60);
  const slugRate = checkRateLimit(`widget:slug:${body.slug}`, slugLimit, WINDOW_MS);
  if (!slugRate.ok) {
    return NextResponse.json(
      { ok: false, error: "This clinic is receiving too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(slugRate.retryAfterSeconds) } },
    );
  }

  // ── Clinic lookup ──────────────────────────────────────────────────────
  let supabase;
  try {
    supabase = createWidgetClient();
  } catch {
    console.error("[api/widget/chat] missing SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.json(
      { ok: false, error: "The AI assistant isn't configured on this server yet." },
      { status: 500 },
    );
  }

  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .select("id, name, slug, timezone, doctor_name, phone, email, address")
    .eq("slug", body.slug)
    .maybeSingle();

  if (clinicError) {
    console.error("[api/widget/chat] clinic lookup failed", clinicError);
    await logAppEvent(supabase, {
      category: "api",
      event: "widget_clinic_lookup_failed",
      metadata: { route: "/api/widget/chat" },
    });
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  if (!clinic) {
    return NextResponse.json(UNAVAILABLE, { status: 403 });
  }

  // ── Activation check ───────────────────────────────────────────────────
  const { data: settings, error: settingsError } = await supabase
    .from("clinic_ai_settings")
    .select("*")
    .eq("clinic_id", clinic.id)
    .maybeSingle();

  if (settingsError) {
    console.error("[api/widget/chat] settings lookup failed", settingsError);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  if (!settings || !settings.is_activated || !settings.enabled) {
    return NextResponse.json(UNAVAILABLE, { status: 403 });
  }

  // ── Availability rules ─────────────────────────────────────────────────
  const { data: rulesResult } = await supabase
    .from("availability_rules")
    .select("day_of_week, start_time, end_time, enabled")
    // Clinic-wide defaults only — per-doctor overrides are not general hours.
    .eq("clinic_id", clinic.id)
    .is("doctor_id", null)
    .order("day_of_week", { ascending: true });

  const ruleViews: RuleView[] = (rulesResult ?? []).map(
    (rule: { day_of_week: number; start_time: string; end_time: string; enabled: boolean }) => ({
      dayOfWeek: rule.day_of_week,
      startTime: rule.start_time,
      endTime: rule.end_time,
      enabled: rule.enabled,
    }),
  );

  // ── Build contexts (same shape as internal route) ──────────────────────
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
    bookingSource: "widget",
  };

  // ── AI provider ────────────────────────────────────────────────────────
  let provider;
  try {
    provider = await resolveProviderForClinic(clinic.id);
  } catch {
    return NextResponse.json(
      { ok: false, error: "The AI assistant isn't configured on this server yet." },
      { status: 500 },
    );
  }

  // ── Run orchestrator ───────────────────────────────────────────────────
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
        "[api/widget/chat] receptionist provider error",
        error.cause ?? error,
      );
      const raw =
        error.cause instanceof Error
          ? error.cause.message
          : typeof error.cause === "string"
            ? error.cause
            : "";
      const retryDelay = /"retryDelay"\s*:\s*"(\d+)s"/.exec(raw);
      const isDailyQuota = retryDelay && Number(retryDelay[1]) >= 60;
      if (isDailyQuota) {
        console.warn("[api/widget/chat] daily quota exhausted");
      }
      await logAppEvent(supabase, {
        clinicId: clinic.id,
        category: "api",
        event: isDailyQuota ? "ai_daily_quota_exhausted" : "ai_provider_error",
        metadata: { route: "/api/widget/chat" },
      });
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
    console.error("[api/widget/chat] unexpected error", error);
    await logAppEvent(supabase, {
      clinicId: clinic.id,
      category: "api",
      event: "widget_chat_unexpected_error",
      metadata: { route: "/api/widget/chat" },
    });
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
