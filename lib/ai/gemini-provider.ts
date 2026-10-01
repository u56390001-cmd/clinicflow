import {
  GoogleGenAI,
  type Schema,
  type FunctionDeclaration,
} from "@google/genai";

import type {
  AIFunctionCall,
  AIGeneratedMessage,
  AIProvider,
  AIProviderChatParams,
  AIProviderCompleteJsonParams,
  AIProviderCompleteParams,
} from "@/lib/ai/types";

/**
 * Gemini implementation of `AIProvider`. This is the ONLY module that imports
 * the Gemini SDK. The API key is read from the server environment only and is
 * never exposed to any client bundle.
 *
 * Function calling: the orchestrator drives the tool loop (execute + feed
 * results back). This provider only returns the model's predicted function
 * calls — it never executes them.
 *
 * Fallback: when the primary model's daily free-tier quota is exhausted
 * (`RESOURCE_EXHAUSTED` with a long retry delay), the provider automatically
 * retries once against a secondary model (`GEMINI_FALLBACK_MODEL`) before
 * failing. Each model's daily quota is tracked independently by Google.
 */
export class GeminiProvider implements AIProvider {
  readonly id = "gemini";

  private readonly ai: GoogleGenAI;
  private readonly primaryModel: string;
  private readonly fallbackModel: string | null;

  /**
   * @param options.apiKey        API key to use. Defaults to `GEMINI_API_KEY`.
   * @param options.model         Primary model. Defaults to `GEMINI_MODEL`.
   * @param options.fallbackModel Fallback model. Defaults to
   *                              `GEMINI_FALLBACK_MODEL` (null when unset).
   */
  constructor(options: {
    apiKey?: string;
    model?: string;
    fallbackModel?: string | null;
  } = {}) {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("No Gemini API key was provided and GEMINI_API_KEY is not set.");
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.primaryModel = options.model ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
    this.fallbackModel = options.fallbackModel ?? process.env.GEMINI_FALLBACK_MODEL ?? null;
  }

  async chat({
    systemInstruction,
    tools,
    messages,
  }: AIProviderChatParams): Promise<AIGeneratedMessage> {
    const functionDeclarations: FunctionDeclaration[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Schema,
    }));

    const config = {
      systemInstruction,
      tools: [{ functionDeclarations }],
      temperature: 0.3,
      maxOutputTokens: 1024,
    };

    const response = await this.generateWithFallback((model) =>
      this.ai.models.generateContent({
        model,
        contents: messages,
        config,
      }),
    );

    // `response.functionCalls` drops the Part-level `thoughtSignature`, which
    // newer Gemini models require when the call is echoed back. Read the raw
    // parts instead so the orchestrator can echo it (data round-trip is
    // otherwise identical).
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const functionCalls: AIFunctionCall[] = parts
      .filter(
        (part) =>
          part.functionCall &&
          typeof part.functionCall.name === "string" &&
          part.functionCall.name.length > 0,
      )
      .map((part) => ({
        id: part.functionCall!.id ?? crypto.randomUUID(),
        name: part.functionCall!.name as string,
        args: part.functionCall!.args ?? {},
        thoughtSignature: part.thoughtSignature,
      }));

    return { text: response.text, functionCalls };
  }

  /**
   * Single-turn generation with no tools declared.
   *
   * Deliberately not `chat` with an empty tool array: that would send
   * `tools: [{ functionDeclarations: [] }]`, asking the model to configure
   * function calling for a request that has no functions. This path is for
   * summarisation, where the only thing wanted back is prose.
   */
  async complete({
    systemInstruction,
    prompt,
    temperature = 0.3,
    maxOutputTokens = 1024,
  }: AIProviderCompleteParams): Promise<string> {
    const response = await this.generateWithFallback((model) =>
      this.ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction, temperature, maxOutputTokens },
      }),
    );

    return response.text ?? "";
  }

  /**
   * Single-turn, JSON-only generation for the vision scanner.
   *
   * The model is told to emit `application/json` and handed `responseSchema`, so
   * it returns a single JSON document instead of prose. `document` (an
   * image/PDF scan, base64) is attached inline as the only user payload besides
   * the prompt. Throws when the model produces nothing or malformed JSON — never
   * returns a string. Callers validate the parsed shape with Zod afterwards.
   */
  async completeJson({
    systemInstruction,
    prompt,
    schema,
    document,
    temperature = 0.1,
    maxOutputTokens = 4096,
  }: AIProviderCompleteJsonParams): Promise<unknown> {
    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [{ text: prompt }];
    if (document) {
      parts.push({ inlineData: { mimeType: document.mimeType, data: document.data } });
    }

    const response = await this.generateWithFallback((model) =>
      this.ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction,
          temperature,
          maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: schema as Schema,
        },
      }),
    );

    const text = response.text?.trim();
    if (!text) {
      throw new Error("The model returned no output to parse.");
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("The model returned malformed JSON. Try a clearer scan.");
    }
  }

  /**
   * Run a request against the primary model, retrying transient failures, and
   * fall back once to the secondary model if the primary's *daily* quota is
   * gone. Google tracks each model's daily cap independently, so the fallback
   * is a genuinely separate allowance rather than a retry of the same one.
   *
   * Generic over the response so both `chat` and `complete` share one copy of
   * this policy — a fallback that applied to only one of them would be a
   * difference nobody would notice until the quota ran out.
   */
  private async generateWithFallback<T>(
    makeRequest: (model: string) => Promise<T>,
  ): Promise<T> {
    try {
      return await retryTransient(() => makeRequest(this.primaryModel));
    } catch (primaryError) {
      if (this.fallbackModel && isDailyQuotaExhausted(primaryError)) {
        const fb = this.fallbackModel;
        console.warn(
          `[gemini] primary model ${this.primaryModel} daily quota exhausted — trying fallback ${fb}`,
        );
        return await retryTransient(() => makeRequest(fb));
      }
      throw primaryError;
    }
  }
}

/** Lazily-created singleton so the API key read happens once per process. */
let providerInstance: GeminiProvider | null = null;

export function getGeminiProvider(): GeminiProvider {
  if (!providerInstance) {
    providerInstance = new GeminiProvider();
  }
  return providerInstance;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns `true` when the error is a daily free-tier quota exhaustion
 * (`RESOURCE_EXHAUSTED` with a `retryDelay` longer than 60s — meaning a
 * daily cap, not a per-minute rate limit).
 */
function isDailyQuotaExhausted(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : JSON.stringify(error);
  const isResourceExhausted =
    /"status"\s*:\s*"RESOURCE_EXHAUSTED"/.test(raw) ||
    /\b429\b/.test(raw);
  if (!isResourceExhausted) return false;
  const retryDelay = /"retryDelay"\s*:\s*"(\d+)s"/.exec(raw);
  if (!retryDelay) return false;
  return Number(retryDelay[1]) >= 60;
}

/**
 * Retry transient API failures (429 rate limits, 503 overload — both common on
 * shared Gemini tiers) with bounded exponential backoff. Permanent errors
 * (400/404/401/403) fail fast. When the API tells us how long to wait
 * (`retryDelay` in the error body) and that's longer than this retry loop could
 * possibly cover, bail immediately rather than burning quota on guaranteed
 * failures.
 */
async function retryTransient<T>(
  request: () => Promise<T>,
  attempts = 3,
  backoffMs = 800,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      const raw =
        error instanceof Error ? error.message : JSON.stringify(error);
      const isTransient = /"status"\s*:\s*"(?:UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED)"/.test(
        raw,
      ) || /\b(?:429|503|504)\b/.test(raw);
      if (!isTransient || attempt === attempts - 1) {
        throw error;
      }
      const retryDelay = /"retryDelay"\s*:\s*"(\d+)s"/.exec(raw);
      if (retryDelay) {
        let remainingBudgetMs = 0;
        for (let i = attempt; i < attempts - 1; i += 1) {
          remainingBudgetMs += backoffMs * 2 ** i;
        }
        if (Number(retryDelay[1]) * 1000 > remainingBudgetMs) {
          throw error;
        }
      }
      await sleep(backoffMs * 2 ** attempt);
    }
  }
  throw lastError;
}
