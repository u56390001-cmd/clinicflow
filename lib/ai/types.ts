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

export interface AIProvider {
  readonly id: string;
  chat(params: AIProviderChatParams): Promise<AIGeneratedMessage>;
  /** Returns the model's text. Empty string when it produced none. */
  complete(params: AIProviderCompleteParams): Promise<string>;
}
