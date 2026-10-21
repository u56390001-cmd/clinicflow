import { GeminiProvider, getGeminiProvider } from "@/lib/ai/gemini-provider";
import type { AIProvider } from "@/lib/ai/types";
import { createWidgetClient } from "@/lib/supabase/widget";

/**
 * Resolve the AI provider for a clinic.
 *
 * The clinic's own LLM credentials (Phase 8: `clinic_ai_settings` +
 * `clinic_ai_secrets`) are the only thing a clinic-facing AI call may use.
 * There is deliberately **no fallback to the platform key** for a clinic: a
 * deployment used to quietly run every clinic on the platform's
 * `GEMINI_API_KEY`, which made one clinic's key another clinic's bill and
 * left the owner with no idea whose quota they were spending.
 *
 * A clinic without a key is not an error state to hide — it is a setup step.
 * `ClinicAiKeyMissingError` is thrown so the caller can show the "add your
 * API key" panel instead of a failed request, and the caller can decide
 * whether that panel is a dead end or a form.
 *
 * The only case that still uses the environment provider is a call with **no
 * clinic at all** (a platform-level job). A clinic always pays for its own
 * inference.
 */
export class ClinicAiKeyMissingError extends Error {
  readonly clinicId: string | undefined;

  constructor(clinicId?: string) {
    super(
      "This clinic has not added an AI API key yet. Add your key in AI Agent settings to switch the assistant on.",
    );
    this.name = "ClinicAiKeyMissingError";
    this.clinicId = clinicId;
  }
}

export async function resolveProviderForClinic(
  clinicId: string,
): Promise<AIProvider> {
  let provider: string | null = null;
  let model: string | null = null;
  let apiKey: string | null = null;

  try {
    const client = createWidgetClient();

    const { data: settings } = await client
      .from("clinic_ai_settings")
      .select("id, llm_provider, llm_model")
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (settings) {
      provider = settings.llm_provider;
      model = settings.llm_model;

      const { data: secret } = await client
        .from("clinic_ai_secrets")
        .select("api_key")
        .eq("settings_id", settings.id)
        .maybeSingle();

      if (secret?.api_key) {
        apiKey = secret.api_key;
      }
    }
  } catch {
    // Missing service-role env or a query failure: fall through to the
    // "no key" branch, which tells the clinic what to do.
  }

  if (!apiKey || provider !== "google") {
    throw new ClinicAiKeyMissingError(clinicId);
  }

  return new GeminiProvider({ apiKey, model: model ?? undefined });
}

/**
 * The provider for a call that has no clinic behind it (a platform job).
 *
 * Kept separate from {@link resolveProviderForClinic} on purpose: the moment
 * a call belongs to a clinic, the clinic's key is the only one that may be
 * used.
 */
export function resolvePlatformProvider(): AIProvider {
  return getGeminiProvider();
}
