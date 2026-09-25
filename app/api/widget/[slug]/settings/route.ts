import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CLINIC_SLUG_REGEX } from "@/lib/constants";
import { createWidgetClient } from "@/lib/supabase/widget";

/**
 * Public widget settings endpoint. Returns the appearance configuration
 * (color, position, avatar, subtitle, agent name, welcome message) for an
 * activated clinic. Used by both `/widget/[slug]` and `widget.js` to render
 * the correct appearance. Only returns data for activated clinics — otherwise
 * 403 with a generic message (same as the chat route, to avoid slug enumeration).
 */
export const runtime = "nodejs";

const paramsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(CLINIC_SLUG_REGEX, "Invalid clinic identifier."),
});

export type WidgetSettingsResponse = {
  ok: true;
  clinic: { name: string; slug: string };
  widget: {
    color: string;
    position: string;
    avatarUrl: string | null;
    headerSubtitle: string | null;
    agentName: string;
    welcomeMessage: string | null;
  };
};

const UNAVAILABLE = {
  ok: false,
  error: "This clinic's AI assistant isn't available right now.",
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = paramsSchema.safeParse({ slug });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid clinic identifier." },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createWidgetClient();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Server configuration error." },
      { status: 500 },
    );
  }

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, name, slug")
    .eq("slug", parsed.data.slug)
    .maybeSingle();

  if (!clinic) {
    return NextResponse.json(UNAVAILABLE, { status: 403 });
  }

  const { data: settings } = await supabase
    .from("clinic_ai_settings")
    .select("is_activated, enabled, widget_color, widget_position, widget_avatar_url, widget_header_subtitle, agent_name, welcome_message")
    .eq("clinic_id", clinic.id)
    .maybeSingle();

  if (!settings || !settings.is_activated || !settings.enabled) {
    return NextResponse.json(UNAVAILABLE, { status: 403 });
  }

  const response: WidgetSettingsResponse = {
    ok: true,
    clinic: { name: clinic.name, slug: clinic.slug },
    widget: {
      color: settings.widget_color,
      position: settings.widget_position,
      avatarUrl: settings.widget_avatar_url,
      headerSubtitle: settings.widget_header_subtitle,
      agentName: settings.agent_name,
      welcomeMessage: settings.welcome_message,
    },
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
    },
  });
}
