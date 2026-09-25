import { Resend } from "resend";

let client: Resend | null = null;

export function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Resend is not configured: set RESEND_API_KEY to send email.",
    );
  }
  client ??= new Resend(apiKey);
  return client;
}
