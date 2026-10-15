import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { sendAssessmentInviteAction } from "@/lib/actions/patient-links";

/**
 * Phase 3 — issue a patient assessment invite.
 *
 * POST { patientId, assessmentType?, templateId?, appointmentId?, deliveryChannel? }
 *
 * Authenticated, clinic-scoped. This route is a thin JSON facade over
 * `sendAssessmentInviteAction` — the same implementation the cockpit's
 * Patient Links panel uses — so staff tooling and programmatic callers
 * (e.g. a future SMS gateway) mint and deliver identical invites.
 *
 * `deliveryChannel`: whatsapp (fully wired) | sms (not yet connected) |
 * in_clinic | link. For anything but WhatsApp the caller shares the returned
 * `path` manually; the DB records `delivery_status = 'pending'`.
 */

const bodySchema = z.object({
  patientId: z.string().uuid(),
  assessmentType: z.string().trim().min(1).max(120).nullish(),
  templateId: z.string().uuid().nullish(),
  appointmentId: z.string().uuid().nullish(),
  deliveryChannel: z
    .enum(["whatsapp", "sms", "in_clinic", "link"])
    .optional()
    .default("whatsapp"),
});

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected a JSON body." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Check the invitation details and try again." },
      { status: 400 },
    );
  }

  const result = await sendAssessmentInviteAction({
    patientId: parsed.data.patientId,
    assessmentType: parsed.data.assessmentType ?? null,
    templateId: parsed.data.templateId ?? null,
    appointmentId: parsed.data.appointmentId ?? null,
    deliveryChannel: parsed.data.deliveryChannel,
  });

  if (!result.ok) {
    // The action already authorizes and scopes to the caller's clinic; a
    // failure is a validation/business error, never a cross-tenant leak.
    return NextResponse.json({ ok: false, error: result.message }, { status: 400 });
  }

  const response = NextResponse.json({
    ok: true,
    path: result.data.path,
    deliveryChannel: result.data.deliveryChannel,
    deliveryStatus: result.data.deliveryStatus,
    whatsappSent: result.data.whatsappSent,
  });
  // A capability-bearing URL must not be cached by any intermediary.
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
