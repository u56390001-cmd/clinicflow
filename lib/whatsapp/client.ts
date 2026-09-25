import { createWidgetClient } from "@/lib/supabase/widget";

/**
 * Meta WhatsApp Cloud API client (Phase 13) — THE single sending path.
 *
 * Every outbound WhatsApp message in the product flows through
 * `sendWhatsappMessage` / its typed helpers here:
 *   - the channel adapter (AI + deterministic replies),
 *   - the notification dispatcher (`lib/notifications/whatsapp.ts`),
 *   - staff manual replies from the Phase 14 inbox.
 * There is deliberately no second implementation of message sending.
 *
 * Secrets discipline: the business access token lives ONLY in
 * `clinic_whatsapp_secrets` (RLS-enabled, zero policies — service-role-only,
 * see migration 0019). It is resolved server-side per send and never logged,
 * cached in module state, or returned to any caller.
 */

const GRAPH_BASE = "https://graph.facebook.com";
const DEFAULT_GRAPH_VERSION = "v23.0";

export type WhatsappCredentials = {
  phoneNumberId: string;
  accessToken: string;
};

/** Thrown when a clinic has no usable WhatsApp connection. */
export class WhatsappNotConnectedError extends Error {
  constructor(message = "WhatsApp is not connected for this clinic.") {
    super(message);
    this.name = "WhatsappNotConnectedError";
  }
}

/** Resolve the clinic's phone_number_id + access token (service-role only). */
export async function getClinicWhatsappCredentials(
  clinicId: string,
): Promise<WhatsappCredentials> {
  const supabase = createWidgetClient();
  const { data, error } = await supabase
    .from("clinic_whatsapp_config")
    .select(
      "id, phone_number_id, connection_status, clinic_whatsapp_secrets(access_token)",
    )
    .eq("clinic_id", clinicId)
    .eq("connection_status", "connected")
    .maybeSingle();

  if (error) {
    throw new WhatsappNotConnectedError(
      `WhatsApp config lookup failed: ${error.message}`,
    );
  }
  const phoneNumberId = data?.phone_number_id ?? null;
  const secretRow = Array.isArray(data?.clinic_whatsapp_secrets)
    ? data?.clinic_whatsapp_secrets[0]
    : data?.clinic_whatsapp_secrets;
  const accessToken =
    secretRow && typeof secretRow === "object" && "access_token" in secretRow
      ? ((secretRow as { access_token?: string }).access_token ?? null)
      : null;

  if (!phoneNumberId || !accessToken) {
    throw new WhatsappNotConnectedError();
  }
  return { phoneNumberId, accessToken };
}

export type SendResult = { ok: true; messageId: string } | { ok: false; error: string };

type SendResponse = {
  messages?: Array<{ id: string }>;
  error?: { message?: string; type?: string; code?: number };
};

async function postMessage(
  credentials: WhatsappCredentials,
  body: Record<string, unknown>,
): Promise<SendResult> {
  const version = process.env.META_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION;
  let response: Response;
  try {
    response = await fetch(
      `${GRAPH_BASE}/${version}/${credentials.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credentials.accessToken}`,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Network error calling Meta.",
    };
  }

  const json = (await response.json().catch(() => ({}))) as SendResponse;
  if (!response.ok || json.error) {
    // Never include the token or full raw payload in errors/logs.
    const message = json.error?.message ?? `HTTP ${response.status}`;
    console.error("[whatsapp-client] send failed", {
      status: response.status,
      code: json.error?.code ?? null,
      type: json.error?.type ?? null,
    });
    return { ok: false, error: message };
  }

  const messageId = json.messages?.[0]?.id ?? "";
  return messageId
    ? { ok: true, messageId }
    : { ok: false, error: "Meta accepted the message but returned no id." };
}

function toRecipient(waId: string): string {
  // wa_ids are digits without '+', but tolerate formatted input defensively.
  const digits = waId.replace(/[^\d]/g, "");
  return digits.length > 0 ? digits : waId.trim();
}

/** Send a plain free-form text message. */
export function sendWhatsappText(
  credentials: WhatsappCredentials,
  to: string,
  body: string,
): Promise<SendResult> {
  return postMessage(credentials, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toRecipient(to),
    type: "text",
    text: { body: body.slice(0, 4096) },
  });
}

export type WhatsappListRow = {
  id: string;
  title: string;
  description?: string;
};

/**
 * Send an interactive LIST message (up to 10 rows across all sections).
 * Rows are truncated to Meta's documented limits (title ≤24, description ≤72,
 * button ≤20 chars). The row id is echoed back verbatim in the patient's
 * `list_reply.id` webhook — this is what makes deterministic handling possible.
 */
export async function sendWhatsappList(
  credentials: WhatsappCredentials,
  to: string,
  input: {
    body: string;
    buttonText: string;
    rows: WhatsappListRow[];
    header?: string;
    footer?: string;
  },
): Promise<SendResult> {
  const rows = input.rows.slice(0, 10).map((row) => ({
    id: row.id.slice(0, 200),
    title: row.title.slice(0, 24),
    ...(row.description ? { description: row.description.slice(0, 72) } : {}),
  }));
  const interactive: Record<string, unknown> = {
    type: "list",
    body: { text: input.body.slice(0, 4096) },
    action: {
      button: input.buttonText.slice(0, 20),
      sections: [{ title: "Options", rows }],
    },
  };
  if (input.header) {
    interactive.header = { type: "text", text: input.header.slice(0, 60) };
  }
  if (input.footer) {
    interactive.footer = { text: input.footer.slice(0, 60) };
  }
  return postMessage(credentials, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toRecipient(to),
    type: "interactive",
    interactive,
  });
}

export type WhatsappButton = { id: string; title: string };

/**
 * Send an interactive REPLY BUTTONS message (max 3 buttons, label ≤20 chars).
 * Button ids are echoed back in the patient's `button_reply.id` webhook.
 */
export async function sendWhatsappButtons(
  credentials: WhatsappCredentials,
  to: string,
  input: { body: string; buttons: WhatsappButton[]; footer?: string },
): Promise<SendResult> {
  const interactive: Record<string, unknown> = {
    type: "button",
    body: { text: input.body.slice(0, 1024) },
    action: {
      buttons: input.buttons.slice(0, 3).map((button) => ({
        type: "reply",
        reply: { id: button.id.slice(0, 256), title: button.title.slice(0, 20) },
      })),
    },
  };
  if (input.footer) {
    interactive.footer = { text: input.footer.slice(0, 60) };
  }
  return postMessage(credentials, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toRecipient(to),
    type: "interactive",
    interactive,
  });
}
