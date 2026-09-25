import { NextResponse, type NextRequest } from "next/server";

import { APP_ROUTES } from "@/lib/constants";
import { logAppEvent } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback — the landing target for verification and recovery emails.
 *
 * Two inbound shapes are handled:
 *   1. `code` — PKCE exchange (used by newer Supabase Auth flows).
 *   2. `token_hash` + `type` — OTP verification from email links
 *      (`type=email` for signup confirmation, `type=recovery` for password
 *      reset). `verifyOtp` establishes the session for the `next` target.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const next = searchParams.get("next");
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : APP_ROUTES.app.dashboard;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  if (tokenHash && (type === "email" || type === "recovery")) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  // Exchange failed (expired link, already used, malformed) — send the user to
  // login with a user-facing hint instead of dumping a raw error.
  await logAppEvent(supabase, {
    category: "auth",
    event: "auth_callback_failed",
    severity: "warning",
    metadata: { flow: code ? "pkce" : type ?? "unknown" },
  });
  return NextResponse.redirect(
    `${origin}${APP_ROUTES.auth.login}?error=invalid_link`,
  );
}
