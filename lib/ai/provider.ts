import { GeminiProvider, getGeminiProvider } from "@/lib/ai/gemini-provider";
import type { AIProvider } from "@/lib/ai/types";
import { createWidgetClient } from "@/lib/supabase/widget";

/**
 * Resolve the AI provider for a clinic, preferring the clinic's own LLM
 * credentials saved in Phase 8 (`clinic_ai_secrets` + `clinic_ai_settings`).
 *
 * Why a service-role read: `clinic_ai_secrets` has ZERO RLS policies, so the
 * stored API key is only ever readable server-side with the service role. A
 * shared singleton provider is impossible here too — each clinic may carry its
 * own key + model — so a fresh provider is built per clinic. Inference is
 * expensive; the extra client construction is not.
 *
 * Falls back to the environment-backed Gemini provider when a clinic has no
 * saved key (or a non-google provider / missing service-role env), so a
 * deployment that never configured per-clinic keys keeps working unchanged.
 */
export async function resolveProviderForClinic(
  clinicId: string,
): Promise<AIProvider> {
  let provider: string | null = null;
  let model: string | null = null;
  let apiKey: string | undefined;

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

      if (secret) {
        apiKey = secret.api_key;
      }
    }
  } catch {
    // Missing service-role env or a query failure: don't let a credentials
    // lookup take the whole assistant down; fall through to the env provider.
  }

  if (apiKey && provider === "google") {
    return new GeminiProvider({ apiKey, model: model ?? undefined });
  }

  return getGeminiProvider();
}
