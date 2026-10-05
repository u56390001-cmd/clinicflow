"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Globe } from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateClinicAction } from "@/lib/actions/settings";
import { slugify } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";
import type { CurrentClinicAccess } from "@/lib/clinic-access";

const initialState: ActionResult | null = null;

/**
 * Label, with the red asterisk for a field the clinic cannot leave blank.
 *
 * The glyph is `aria-hidden` on purpose. The control's own `required` already
 * makes assistive tech announce "required", so exposing the asterisk as well
 * would have every field read out "Clinic name, required, star".
 */
function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor}>
      {children}
      {required && (
        <span aria-hidden="true" className="ml-0.5 text-status-destructive">
          *
        </span>
      )}
    </Label>
  );
}

/** Per-field message, wired to the control via `aria-describedby`. */
function FieldMessage({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p
      id={id}
      className="flex items-start gap-1 text-xs font-medium text-status-destructive"
    >
      <AlertCircle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function ClinicSettingsForm({
  clinic,
  canWrite,
}: {
  clinic: CurrentClinicAccess["clinic"];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateClinicAction,
    initialState,
  );
  const [name, setName] = useState(clinic.name);
  const [slug, setSlug] = useState(clinic.slug);

  const previewSlug = slug.trim().length > 0 ? slug.trim() : slugify(name);

  const submitted = state !== null;

  /**
   * Errors from the last submit, keyed by the server's field names.
   *
   * Held rather than derived from live values so that typing into a field does
   * not clear the complaint the server made about the submit the doctor just
   * tried — the message belongs to that attempt, and it goes away when the next
   * one succeeds.
   */
  const errors =
    submitted && state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Clinic profile</CardTitle>
        <CardDescription>
          {canWrite
            ? "Update your clinic's public details."
            : "Read-only for staff. Ask an owner or admin to make changes."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {submitted && !state.ok && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {submitted && state.ok && (
          <Alert variant="success" className="mb-4">
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>Clinic settings saved.</AlertDescription>
          </Alert>
        )}

        <form
          key={clinic.id}
          action={formAction}
          noValidate
          className="space-y-4"
        >
          <div className="space-y-2">
            <FieldLabel htmlFor="name" required>
              Clinic name
            </FieldLabel>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sunrise Family Clinic"
              autoComplete="organization"
              required
              disabled={!canWrite}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
            <FieldMessage id="name-error">{errors.name}</FieldMessage>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="slug" required>
              Clinic URL
            </FieldLabel>
            <div className="relative">
              <Globe
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <Input
                id="slug"
                name="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="pl-9"
                placeholder={clinic.slug}
                disabled={!canWrite}
                aria-invalid={!!errors.slug}
                aria-describedby={errors.slug ? "slug-error" : "slug-hint"}
              />
            </div>
            <FieldMessage id="slug-error">{errors.slug}</FieldMessage>
            {!errors.slug && (
              <p id="slug-hint" className="text-xs text-text-muted">
                Public page will be{" "}
                <span className="font-medium text-text-secondary">
                  /{previewSlug}
                </span>
                . Leave empty to use the clinic name.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="doctor-name" required>
              Doctor name
            </FieldLabel>
            <Input
              id="doctor-name"
              name="doctorName"
              defaultValue={clinic.doctor_name ?? ""}
              placeholder="Dr. Sarah Chen"
              autoComplete="name"
              required
              disabled={!canWrite}
              aria-invalid={!!errors.doctorName}
              aria-describedby={
                errors.doctorName ? "doctorName-error" : undefined
              }
            />
            <FieldMessage id="doctorName-error">
              {errors.doctorName}
            </FieldMessage>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel htmlFor="phone" required>
                Phone
              </FieldLabel>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={clinic.phone ?? ""}
                placeholder="+1 (555) 123-4567"
                autoComplete="tel"
                required
                disabled={!canWrite}
                aria-invalid={!!errors.phone}
                aria-describedby={errors.phone ? "phone-error" : undefined}
              />
              <FieldMessage id="phone-error">{errors.phone}</FieldMessage>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="email" required>
                Contact email
              </FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={clinic.email ?? ""}
                placeholder="front@clinic.com"
                autoComplete="email"
                required
                disabled={!canWrite}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
              <FieldMessage id="email-error">{errors.email}</FieldMessage>
            </div>
          </div>

          {/* The one optional field. It says so, because a lone unmarked input
              in an otherwise required form reads as an oversight rather than a
              decision. */}
          <div className="space-y-2">
            <Label htmlFor="address">
              Address
              <span className="ml-1.5 text-xs font-normal text-text-muted">
                (optional)
              </span>
            </Label>
            <Input
              id="address"
              name="address"
              defaultValue={clinic.address ?? ""}
              placeholder="123 Main Street, Springfield"
              autoComplete="street-address"
              disabled={!canWrite}
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? "address-error" : undefined}
            />
            <FieldMessage id="address-error">{errors.address}</FieldMessage>
          </div>

          {canWrite && (
            <SubmitButton
              className={cn("w-full sm:w-auto")}
              loadingText="Saving…"
            >
              Save changes
            </SubmitButton>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
