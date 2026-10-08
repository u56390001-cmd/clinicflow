import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CLINIC_SLUG_REGEX } from "@/lib/constants";
import { createWidgetClient } from "@/lib/supabase/widget";

/**
 * Public widget directory endpoint. Returns the clinic's visible doctor roster
 * (name, specialty, qualification, experience, fee, bio) so the chat widget can
 * render doctor cards locally, without routing the request through the chat API.
 * Read-only and additive — the AI conversation and booking flow are unaffected.
 *
 * Only returns data for activated clinics, with the same 403 as the settings
 * route, to avoid slug enumeration.
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

export type WidgetDirectoryResponse = {
  ok: true;
  doctors: Array<{
    id: string;
    name: string;
    specialty: string | null;
    qualification: string | null;
    yearsOfExperience: number | null;
    consultationFee: number | null;
    about: string | null;
  }>;
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
    .select("id")
    .eq("slug", parsed.data.slug)
    .maybeSingle();

  if (!clinic) {
    return NextResponse.json(UNAVAILABLE, { status: 403 });
  }

  const { data: settings } = await supabase
    .from("clinic_ai_settings")
    .select("is_activated, enabled")
    .eq("clinic_id", clinic.id)
    .maybeSingle();

  if (!settings || !settings.is_activated || !settings.enabled) {
    return NextResponse.json(UNAVAILABLE, { status: 403 });
  }

  const { data: doctors } = await supabase
    .from("doctors")
    .select(
      "id, name, specialty, qualification, years_of_experience, consultation_fee, professional_description",
    )
    .eq("clinic_id", clinic.id)
    .eq("is_visible", true)
    .order("created_at", { ascending: true });

  const response: WidgetDirectoryResponse = {
    ok: true,
    doctors: (doctors ?? []).map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      specialty: doctor.specialty,
      qualification: doctor.qualification,
      yearsOfExperience: doctor.years_of_experience,
      consultationFee: doctor.consultation_fee,
      about: doctor.professional_description,
    })),
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
    },
  });
}
