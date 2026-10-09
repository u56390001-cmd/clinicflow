"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction } from "@/lib/actions/auth";
import { APP_ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types";

const initialState: ActionResult = { ok: true, data: undefined };

export function SignupForm({
  initialEmail,
  next,
}: {
  /** Pre-fill the invited address when the user arrived from an invite link. */
  initialEmail?: string;
  /** Return the user to this internal path after signing up (links carry it). */
  next?: string;
}) {
  const [state, formAction] = useActionState(signupAction, initialState);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {!state.ok && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@clinic.com"
          defaultValue={initialEmail}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-xs text-text-muted">At least 8 characters.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password-confirm">Confirm password</Label>
        <PasswordInput
          id="password-confirm"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <SubmitButton className="w-full" loadingText="Creating your account…">
        Create account
      </SubmitButton>

      <p className="text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link
          href={APP_ROUTES.auth.login}
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
