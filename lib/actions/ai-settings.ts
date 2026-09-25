"use server";

import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { createWidgetClient } from "@/lib/supabase/widget";
import { aiSettingsSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";

/**
 * Save the clinic's AI Receptionist settings (Phase 5). The form submits one
 * JSON `payload` (structured fields — FAQs, required patient fields — make
 * single-field FormData awkward). Upserts `clinic_ai_settings`, one row per
 * clinic keyed by the unique `clinic_id`. Zod drops FAQ entries with an empty
 * question/answer, keeping the DB CHECK constraint satisfied.
 */
export async function saveAiSettingsAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    return { ok: false, message: "Missing AI settings data." };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, message: "Invalid AI settings data." };
  }
  const parsed = aiSettingsSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[saveAiSettingsAction] validation failed", {
      issues: parsed.error.flatten(),
    });
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the AI settings and try again.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to configure the AI receptionist." };
  }
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can configure the AI receptionist." };
  }

  const data = parsed.data;

  // Persist settings first so we have the settings row `id` to reference from
  // `clinic_ai_secrets.settings_id` (FK → clinic_ai_settings.id, not clinic_id).
  const { data: settingsRow, error } = await supabase
    .from("clinic_ai_settings")
    .upsert(
      {
        clinic_id: access.clinic.id,
        enabled: data.enabled,
        agent_name: data.agentName,
        welcome_message: data.welcomeMessage || null,
        tone: data.tone,
        agent_tier: data.agentTier,
        greeting_style: data.greetingStyle,
        whatsapp_enabled: data.whatsappEnabled,
        clinic_description: data.clinicDescription || null,
        booking_rules: data.bookingRules || null,
        cancellation_policy_text: data.cancellationPolicyText || null,
        faqs: data.faqs,
        required_patient_fields: data.requiredPatientFields,
        is_activated: data.isActivated,
        widget_color: data.widgetColor,
        widget_position: data.widgetPosition,
        widget_avatar_url: data.widgetAvatarUrl || null,
        widget_header_subtitle: data.widgetHeaderSubtitle || null,
        llm_provider: data.llmProvider,
        llm_model: data.llmModel || null,
      },
      { onConflict: "clinic_id" },
    )
    .select("id")
    .single();

  if (error || !settingsRow) {
    console.error("[saveAiSettingsAction] clinic_ai_settings upsert failed", {
      clinicId: access.clinic.id,
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return { ok: false, message: "We couldn't save your AI settings. Please try again." };
  }

  // Phase 8: Handle LLM API key and verification.
  if (data.llmApiKey) {
    // Verify the API key with the selected provider.
    const verification = await verifyLlmApiKey(
      data.llmProvider,
      data.llmApiKey,
      data.llmModel,
    );
    if (!verification.ok) {
      return {
        ok: false,
        message: verification.message ?? "API key verification failed.",
      };
    }

    // Store the API key in clinic_ai_secrets. This table intentionally has ZERO
    // RLS policies (service-role only), so it must go through the service-role
    // client — the session-scoped client would be denied every time.
    const serviceRole = createWidgetClient();
    const { error: secretError } = await serviceRole
      .from("clinic_ai_secrets")
      .upsert(
        {
          settings_id: settingsRow.id,
          api_key: data.llmApiKey,
        },
        { onConflict: "settings_id" },
      );

    if (secretError) {
      console.error("[saveAiSettingsAction] clinic_ai_secrets upsert failed", {
        code: secretError.code,
        message: secretError.message,
      });
      return { ok: false, message: "Failed to save API key. Please try again." };
    }

    const verifiedAt = new Date().toISOString();

    const { error: verifiedError } = await supabase
      .from("clinic_ai_settings")
      .update({
        llm_key_verified: true,
        llm_key_verified_at: verifiedAt,
      })
      .eq("id", settingsRow.id);

    if (verifiedError) {
      console.error("[saveAiSettingsAction] llm_key_verified update failed", {
        code: verifiedError.code,
        message: verifiedError.message,
      });
      return { ok: false, message: "We couldn't save your AI settings. Please try again." };
    }
  }

  return { ok: true, data: undefined };
}

/**
 * Verify just the API key without saving anything (Phase 8). Powers the
 * "Verify" button in the provider selector so a clinic can test a key before
 * committing the full settings form.
 */
export async function verifyLlmApiKeyAction(
  provider: string,
  apiKey: string,
  model?: string | null,
): Promise<ActionResult> {
  const result = await verifyLlmApiKey(provider, apiKey, model);
  if (!result.ok) {
    return { ok: false, message: result.message ?? "API key verification failed." };
  }
  return { ok: true, data: undefined };
}

/**
 * Verify an LLM API key by making a simple test call to the provider.
 * Returns { ok: true } if verification succeeds, { ok: false, message } otherwise.
 */
async function verifyLlmApiKey(
  provider: string,
  apiKey: string,
  model?: string | null,
): Promise<{ ok: boolean; message?: string }> {
  try {
    if (provider === "google") {
      // Test Gemini API key with a simple completion request against the
      // model the clinic selected (falls back to the ubiquitous flash-lite).
      const testModel = model?.trim() || "gemini-2.0-flash-lite";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(testModel)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: "test" }],
              },
            ],
          }),
        },
      );
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const message = error.error?.message || "Invalid API key";
        return { ok: false, message };
      }
      
      return { ok: true };
    } else if (provider === "openai") {
      // OpenAI verification (when implemented)
      return { ok: false, message: "OpenAI support is coming soon." };
    } else if (provider === "anthropic") {
      // Anthropic verification (when implemented)
      return { ok: false, message: "Anthropic support is coming soon." };
    }
    
    return { ok: false, message: "Unknown provider." };
  } catch (error) {
    return { 
      ok: false, 
      message: `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
