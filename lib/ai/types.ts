/**
 * AI provider abstraction (PRD §15).
 *
 * Business logic (orchestrator, tools, booking) depends only on `AIProvider`.
 * Provider-specific SDK calls live exclusively behind an implementation
 * (currently `GeminiProvider`) so a future provider can be added without
 * rewriting the booking system.
 */

/** A tool the model may call. `parameters` is JSON Schema (for the model);
 * args are re-validated server-side before execution. */
export type AIToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AIChatMessage = {
  role: "user" | "model";
  parts: Array<AITextPart | AIFunctionCallPart | AIFunctionResponsePart>;
};

export type AITextPart = { text: string };
export type AIFunctionCallPart = {
  functionCall: { id: string; name: string; args: Record<string, unknown> };
  /** Opaque signature newer Gemini models require when echoing a call. It
   * sits on the Part (sibling of functionCall), not on the call itself. */
  thoughtSignature?: string;
};
export type AIFunctionResponsePart = {
  functionResponse: { id: string; name: string; response: Record<string, unknown> };
};

export type AIFunctionCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Opaque signature newer Gemini models require when echoing a call. */
  thoughtSignature?: string;
};

/** One model turn: a text reply and/or function calls to execute. */
export type AIGeneratedMessage = {
  text?: string;
  functionCalls: AIFunctionCall[];
};

export type AIProviderChatParams = {
  systemInstruction: string;
  tools: AIToolDefinition[];
  messages: AIChatMessage[];
};

/**
 * A single-turn, tool-free generation. Separate from `chat` because the
 * summarisation callers (see `lib/ai/patient-summary.ts`) have no tools to
 * declare and no conversation to carry — passing an empty tool list through the
 * chat path would ask the provider to configure function calling for a request
 * that can never produce a function call.
 */
export type AIProviderCompleteParams = {
  systemInstruction: string;
  prompt: string;
  /** Provider default when omitted. Lower is more literal. */
  temperature?: number;
  maxOutputTokens?: number;
};

/**
 * An inline document attachment (scan, PDF, image) base64-encoded for the
 * model. The OCR parser's only payload — the file itself is sent in `data` and
 * must never contain identifiers beyond what the caller already de-identified.
 */
export type AIInlineDocument = {
  /** e.g. `application/pdf`, `image/png`. */
  mimeType: string;
  /** Base64-encoded bytes. */
  data: string;
};

/**
 * A single-turn, tool-free generation that must come back as structured JSON.
 * `schema` is a JSON Schema (OpenAPI 3.0 subset) the provider hands to the
 * model as its response schema; providers without first-class support just
 * prompt for JSON and the caller re-validates with Zod regardless.
 *
 * `document` is optional: the OCR parser passes the medical scan inline so the
 * model can read it. Text-only callers omit it.
 */
export type AIProviderCompleteJsonParams = {
  systemInstruction: string;
  prompt: string;
  /** An [OpenAPI 3.0 subset](https://spec.openapis.org/oas/v3.0.3#schema) schema. */
  schema: Record<string, unknown>;
  /** Optional image/PDF to attach alongside the prompt. */
  document?: AIInlineDocument;
  temperature?: number;
  maxOutputTokens?: number;
};

export interface AIProvider {
  readonly id: string;
  chat(params: AIProviderChatParams): Promise<AIGeneratedMessage>;
  /** Returns the model's text. Empty string when it produced none. */
  complete(params: AIProviderCompleteParams): Promise<string>;
  /**
   * Returns the model's output parsed as JSON. Throws when the model returns
   * nothing or emits malformed JSON — callers validate shape with Zod after.
   */
  completeJson(params: AIProviderCompleteJsonParams): Promise<unknown>;
}
