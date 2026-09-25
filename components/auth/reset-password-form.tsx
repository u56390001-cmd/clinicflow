"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/lib/actions/auth";
import { APP_ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types";

const initialState: ActionResult = { ok: true, data: undefined };

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {!state.ok && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
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
        <Label htmlFor="password-confirm">Confirm new password</Label>
        <PasswordInput
          id="password-confirm"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <SubmitButton className="w-full" loadingText="Updating your password…">
        Update password
      </SubmitButton>

      <p className="text-center text-sm text-text-secondary">
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
