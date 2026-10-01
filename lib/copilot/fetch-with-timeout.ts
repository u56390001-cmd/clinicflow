/**
 * `fetch` with a deadline.
 *
 * Why this exists: the copilot's two calls are the only place in the Rx builder
 * that waits on an external model, and without a ceiling a stalled request left
 * `isProcessing` true forever — the drawer showed "Processing..." permanently
 * and the only way out was a page reload, which threw away the draft.
 *
 * The timeout is enforced with an `AbortController` rather than
 * `AbortSignal.timeout` so the abort can be told apart from a real network
 * error and reported as what it is.
 */
export class CopilotTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotTimeoutError";
  }
}

/**
 * @param timeoutMs  Deadline in milliseconds.
 * @param label      What the caller was doing, used in the timeout message so
 *                   the doctor sees which step stalled.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  // Honour an incoming signal too, so a caller that already aborts (an unmount,
  // a superseded request) still cancels promptly.
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new CopilotTimeoutError(
        `${label} timed out after ${Math.round(timeoutMs / 1000)}s. Check your connection and try again.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Transcription is audio plus a model pass; structure is a model pass alone. */
export const TRANSCRIBE_TIMEOUT_MS = 120_000;
export const STRUCTURE_TIMEOUT_MS = 90_000;
export const COMMAND_TIMEOUT_MS = 60_000;