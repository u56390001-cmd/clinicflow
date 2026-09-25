"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/lib/actions/auth";
import { APP_ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types";

/**
 * `null` marks the not-yet-submitted state so we can distinguish the success
 * alert (`ok: true`) from a fresh form.
 */
export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    forgotPasswordAction,
    null,
  );

  const submitted = state !== null;

  return (
    <form action={formAction} noValidate className="space-y-4">
      {submitted && state.ok && (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertDescription>
            If an account exists for that email, we&apos;ve sent a link to reset
            your password. Check your inbox (and spam folder).
          </AlertDescription>
        </Alert>
      )}
      {submitted && !state.ok && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {!submitted || !state.ok ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@clinic.com"
              required
            />
          </div>

          <SubmitButton className="w-full" loadingText="Sending reset link…">
            Send reset link
          </SubmitButton>
        </>
      ) : null}

      <p className="text-center text-sm text-text-secondary">
        Remembered your password?{" "}
        <Link
          href={APP_ROUTES.auth.login}
          className="font-medium text-primary hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
