"use server";

import { redirect } from "next/navigation";

import { APP_ROUTES, getSiteUrl } from "@/lib/constants";
import { logAppEvent } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { createWidgetClient } from "@/lib/supabase/widget";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";

function fieldError<T extends { issues?: Array<{ message?: string }> }>(
  error: T,
  fallback: string,
): ActionResult {
  return { ok: false, message: error.issues?.[0]?.message ?? fallback };
}

/**
 * Log the raw Supabase auth error in development only. The user-facing message
 * stays generic — Supabase deliberately does not distinguish "unconfirmed
 * user", "wrong password", or "user not found" in its login error, and we must
 * not leak that detail to the UI either.
 */
function logAuthError(
  operation: string,
  error: { message?: string; status?: number; code?: string },
) {
  if (process.env.NODE_ENV === "development") {
    console.error(`[auth:${operation}]`, {
      message: error.message,
      status: error.status,
      code: error.code,
    });
  }
}

/**
 * Record a failed authentication attempt in `app_event_logs` (Phase 9
 * observability). Uses the service-role client because by definition there is
 * no authenticated session to attribute. Never throws; no PII beyond what
 * Supabase already returns in error codes.
 */
async function logAuthFailure(
  event: string,
  error: { message?: string; status?: number; code?: string },
) {
  try {
    const supabase = createWidgetClient();
    await logAppEvent(supabase, {
      category: "auth",
      event,
      severity: "warning",
      metadata: { code: error.code ?? null, status: error.status ?? null },
    });
  } catch {
    // Observability env not configured; dev console already fired.
  }
}

export async function signupAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return fieldError(parsed.error, "Check your details and try again.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${getSiteUrl()}${APP_ROUTES.callback}?next=${APP_ROUTES.app.dashboard}`,
    },
  });

  if (error) {
    logAuthError("signup", error);
    const message =
      error.code === "user_already_exists" ||
      error.message.toLowerCase().includes("already registered")
        ? "An account with this email already exists. Try logging in instead."
        : "We couldn't create your account. Please try again.";
    return { ok: false, message };
  }

  if (data.session) {
    // Email confirmation is disabled for this project, so a session already
    // exists and we can go straight to the app.
    redirect(APP_ROUTES.app.dashboard);
  }

  // Email confirmation is enabled: the user must verify before they can log in.
  redirect(APP_ROUTES.auth.verify);
}

export async function loginAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return fieldError(parsed.error, "Check your details and try again.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    logAuthError("login", error);
    await logAuthFailure("login_failed", error);
    return { ok: false, message: "Invalid email or password." };
  }

  const next = formData.get("next");
  const safeNext =
    typeof next === "string" && next.startsWith("/app")
      ? next
      : APP_ROUTES.app.dashboard;
  redirect(safeNext);
}

export async function forgotPasswordAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return fieldError(parsed.error, "Enter a valid email address.");
  }

  const supabase = await createClient();
  // This call does not reveal whether the account exists — the response is
  // the same whether or not the email has an account, which avoids
  // user-enumeration.
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${getSiteUrl()}${APP_ROUTES.callback}?next=${APP_ROUTES.auth.resetPassword}`,
    },
  );

  if (error) {
    return {
      ok: false,
      message: "We couldn't send a reset link. Please try again.",
    };
  }

  return { ok: true, data: undefined };
}

export async function resetPasswordAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return fieldError(parsed.error, "Check your new password and try again.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      ok: false,
      message:
        "We couldn't update your password. Your reset link may have expired — please request a new one.",
    };
  }

  redirect(`${APP_ROUTES.auth.login}?reset=success`);
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(APP_ROUTES.auth.login);
}
