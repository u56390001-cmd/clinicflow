"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Building2, CheckCircle2, Trash2 } from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  removeClinicLogoAction,
  uploadClinicLogoAction,
} from "@/lib/actions/settings";
import type { ActionResult } from "@/types";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Clinic logo picker for Organization settings.
 *
 * The 80px dashed tile and the "Choose file" affordance come straight from the
 * supplied reference markup, remapped onto this project's semantic tokens:
 * `border-gray-300` becomes `border-text-muted/40`, `bg-gray-50` becomes
 * `bg-skeleton`, and the button border/hover follow the same mapping. Nothing
 * renders a raw grey value.
 *
 * The visible label is a real `<Label>` bound to the file input rather than a
 * `<div>` styled as a button, so the control is reachable by keyboard and
 * announced as a file input. `sr-only` rather than `display: none` keeps it in
 * the accessibility tree — the reference's `hidden` class would have removed it
 * entirely.
 */
export function ClinicLogoField({
  logoUrl,
  clinicName,
  canWrite,
}: {
  logoUrl: string | null;
  clinicName: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const [uploadState, uploadAction] = useActionState<
    ActionResult | null,
    FormData
  >(uploadClinicLogoAction, null);
  const [removeState, removeAction] = useActionState<
    ActionResult | null,
    FormData
  >(removeClinicLogoAction, null);

  useEffect(() => {
    if (uploadState?.ok || removeState?.ok) {
      setFileName(null);
      setLocalError(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  }, [uploadState, removeState, router]);

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setFileName(null);
      setLocalError(null);
      return;
    }
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setLocalError("Logo must be a PNG or JPG image.");
      setFileName(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("Logo must be 2MB or smaller.");
      setFileName(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setLocalError(null);
    setFileName(file.name);
  }

  const uploadError =
    uploadState && !uploadState.ok ? uploadState.message : null;
  const removeError =
    removeState && !removeState.ok ? removeState.message : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clinic logo</CardTitle>
        <CardDescription>
          {canWrite
            ? "Shown on your public booking page and patient reminders."
            : "Read-only for staff. Ask an owner or admin to make changes."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {uploadError && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{uploadError}</AlertDescription>
          </Alert>
        )}
        {removeError && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{removeError}</AlertDescription>
          </Alert>
        )}
        {(uploadState?.ok || removeState?.ok) && (
          <Alert variant="success">
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>
              {removeState?.ok ? "Logo removed." : "Logo updated."}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex size-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-card border-2 border-dashed border-text-muted/40 bg-skeleton">
            {logoUrl ? (
              // A plain <img>: the URL points at the Supabase public bucket, a
              // host that is not in next/image's remotePatterns, and routing it
              // through the optimizer would gain nothing for a 2MB logo.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${clinicName} logo`}
                className="size-full object-cover"
              />
            ) : (
              <Building2
                className="size-7 text-text-muted"
                strokeWidth={2}
                aria-hidden="true"
              />
            )}
          </div>

          {canWrite && (
            <form action={uploadAction} className="space-y-2">
              <input
                ref={inputRef}
                id="clinic-logo-input"
                name="logo"
                type="file"
                accept="image/png,image/jpeg"
                onChange={onPick}
                className="sr-only"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Label
                  htmlFor="clinic-logo-input"
                  className="flex w-fit cursor-pointer items-center gap-2 rounded-control border border-text-muted/40 px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-skeleton"
                >
                  Choose file
                </Label>
                <SubmitButton loadingText="Uploading">Upload logo</SubmitButton>
                {logoUrl && (
                  <SubmitButton
                    formAction={removeAction}
                    variant="outline"
                    loadingText="Removing"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Remove logo
                  </SubmitButton>
                )}
              </div>
              <p className="text-xs text-text-muted">PNG, JPG — max 2MB</p>
              {fileName && (
                <p className="text-xs font-medium text-text-secondary">
                  {fileName}
                </p>
              )}
              {localError && (
                <p
                  role="alert"
                  className="flex items-start gap-1 text-xs font-medium text-status-destructive"
                >
                  <AlertCircle
                    aria-hidden="true"
                    className="mt-px size-3.5 shrink-0"
                  />
                  <span>{localError}</span>
                </p>
              )}
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
