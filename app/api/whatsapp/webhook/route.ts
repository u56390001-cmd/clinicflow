import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { checkRateLimit, envInt } from "@/lib/ai/rate-limit";
import type { Database } from "@/types/database";
import {
  getClinicWhatsappCredentials,
  WhatsappNotConnectedError,
} from "@/lib/whatsapp/client";
import {
  parseWebhookMessages,
  processInboundMessage,
  type AdapterClinic,
} from "@/lib/whatsapp/adapter";
import { createWidgetClient } from "@/lib/supabase/widget";

/**
 * Meta WhatsApp Cloud API webhook (Phase 13).
 *
 * GET  — subscription handshake: echo the raw `hub.challenge` when
 *        `hub.verify_token` matches WHATSAPP_WEBHOOK_VERIFY_TOKEN.
 * POST — inbound messages/statuses. The request is authenticated with the
 *        `X-Hub-Signature-256` HMAC (META_APP_SECRET) over the RAW body, then
 *        answered 200 immediately; actual processing happens fire-and-forget
 *        so Meta never times out and retries. Duplicates are absorbed by the
 *        unique `meta_message_id` constraint inside the adapter.
 */

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (
    mode === "subscribe" &&
    challenge &&
    expectedToken &&
    token === expectedToken
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Constant-time validation of Meta's request signature over the raw body. */
function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    // Without a configured app secret we cannot authenticate callbacks at
    // all. Accept unsigned payloads ONLY outside production so local
    // development against the Meta test number stays possible.
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const messages = parseWebhookMessages(rawBody);
  for (const message of messages) {
    // Fire-and-forget: respond to Meta instantly, never block on AI latency.
    void handleInboundMessage(message).catch((error) => {
      console.error("[whatsapp-webhook] unhandled processing error", error);
    });
  }
  return NextResponse.json({ received: true });
}

async function handleInboundMessage(
  message: Awaited<ReturnType<typeof parseWebhookMessages>>[number],
): Promise<void> {
  const rate = checkRateLimit(
    `wa:${message.phoneNumberId}:${message.fromWaId}`,
    envInt("WHATSAPP_RATE_LIMIT_PER_MINUTE", 10),
    60_000,
  );
  if (!rate.ok) {
    console.warn("[whatsapp-webhook] rate limited", {
      phoneNumberId: message.phoneNumberId,
    });
    return;
  }

  let supabase: SupabaseClient<Database>;
  try {
    supabase = createWidgetClient();
  } catch {
    console.error("[whatsapp-webhook] missing service-role configuration");
    return;
  }

  // Resolve which business this message belongs to via its phone_number_id.
  const { data: config } = await supabase
    .from("clinic_whatsapp_config")
    .select("clinic_id, connection_status")
    .eq("phone_number_id", message.phoneNumberId)
    .maybeSingle();
  if (!config || config.connection_status !== "connected") return;

  const [{ data: clinic }, { data: settings }] = await Promise.all([
    supabase
      .from("clinics")
      .select("id, name, slug, timezone, doctor_name, phone, email, address")
      .eq("id", config.clinic_id)
      .maybeSingle(),
    supabase
      .from("clinic_ai_settings")
      .select("*")
      .eq("clinic_id", config.clinic_id)
      .maybeSingle(),
  ]);
  if (!clinic || !settings || !settings.whatsapp_enabled) return;

  try {
    const credentials = await getClinicWhatsappCredentials(clinic.id);
    await processInboundMessage({
      supabase,
      clinic: clinic satisfies AdapterClinic as AdapterClinic,
      settings,
      credentials,
      inbound: message,
    });
  } catch (error) {
    if (error instanceof WhatsappNotConnectedError) {
      console.warn("[whatsapp-webhook] clinic not connected", clinic.id);
      return;
    }
    throw error;
  }
}
