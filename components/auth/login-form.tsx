"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/lib/actions/auth";
import { APP_ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types";

const initialState: ActionResult = { ok: true, data: undefined };

interface LoginFormProps {
  /** Redirect target after a successful sign-in (from `?next=`). */
  next?: string;
  /** Notice rendered at the top, e.g. password-reset success. */
  notice?: string;
  /** Error rendered at the top, e.g. an invalid auth link. */
  errorMessage?: string;
}

export function LoginForm({ next, notice, errorMessage }: LoginFormProps) {
  const [state, formAction] = useActionState(loginAction, initialState);

  const errorText = !state.ok ? state.message : undefined;

  return (
    <form action={formAction} noValidate className="space-y-4">
      {notice && (
        <Alert variant="success">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {(errorMessage || errorText) && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{errorMessage ?? errorText}</AlertDescription>
        </Alert>
      )}

      {next ? <input type="hidden" name="next" value={next} /> : null}

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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href={APP_ROUTES.auth.forgotPassword}
            className="text-sm font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </div>

      <SubmitButton className="w-full" loadingText="Signing you in…">
        Sign in
      </SubmitButton>

      <p className="text-center text-sm text-text-secondary">
        New to MedBook AI?{" "}
        <Link
          href={APP_ROUTES.auth.signup}
          className="font-medium text-primary hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
