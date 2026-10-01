/**
 * Turns a provider or validation failure into one line a doctor can act on.
 *
 * The raw errors coming out of the Gemini SDK are multi-kilobyte JSON dumps of
 * the response envelope — status, retry delay, request URL, sometimes the prompt.
 * Passing one of those straight through the API route lands it in the drawer as
 * a paragraph of noise, and in the console as a stack trace, for what is almost
 * always one of five recognisable situations. Everything here is also what keeps
 * the prompt and the patient's transcript out of the browser.
 */
export function describeCopilotError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (/API[_ ]?KEY[_ ]?INVALID|API key not valid|unauthorized|\b401\b|\b403\b/i.test(raw)) {
    return "The AI key was rejected. Check GEMINI_API_KEY in your environment.";
  }
  if (/RESOURCE_EXHAUSTED|\b429\b|quota|rate limit/i.test(raw)) {
    return "The AI provider's quota for now is used up. Try again in a minute.";
  }
  if (/UNAVAILABLE|\b503\b|overloaded|internal error/i.test(raw)) {
    return "The AI provider is busy right now. Try again in a moment.";
  }
  if (/DEADLINE_EXCEEDED|\b504\b|ETIMEDOUT|timed? ?out/i.test(raw)) {
    return "The copilot took too long to answer. Try again.";
  }
  if (/no gemini api key/i.test(raw)) {
    return "GEMINI_API_KEY is not configured on the server.";
  }

  return fallback;
}