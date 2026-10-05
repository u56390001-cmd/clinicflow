"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

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
import { updatePatientCodeSettingsAction } from "@/lib/actions/settings";
import { samplePatientCode } from "@/lib/patient-code";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";
import type { PatientCodeFormat } from "@/types/database";

/** The two shapes offered, in the order the card lists them. */
const FORMATS: { value: PatientCodeFormat; label: string; example: string }[] =
  [
    { value: "sequence", label: "Prefix + Sequence", example: "CLI-00001" },
    {
      value: "year_sequence",
      label: "Prefix + Year + Sequence",
      example: "CLI-2026-00001",
    },
  ];

/**
 * Patient ID (UHID) settings for Organization settings → Patient ID.
 *
 * Layout follows the supplied reference markup — header with a tinted icon
 * chip, the prefix field on its own row, two format choices as selectable
 * cards, a live "next ID" preview, and an amber note about existing patients —
 * with every colour remapped onto this project's tokens. The reference's
 * `rgb(238,240,251)` chip is `bg-primary/10`, its `rgb(78,93,181)` is
 * `text-primary`, and the amber callout uses the status tokens rather than
 * raw `amber-50`/`amber-800`.
 *
 * Both format previews arrive precomputed from the server, so switching
 * between them updates the preview instantly without a round trip and without
 * the client having to re-derive the numbering rules.
 */
export function PatientIdFormatCard({
  initialPrefix,
  initialFormat,
  /** Next ID per format, keyed by format value. */
  previews,
  /** Current year in the clinic's timezone — matches the 0055 trigger. */
  year,
  canWrite,
}: {
  initialPrefix: string;
  initialFormat: PatientCodeFormat;
  previews: Record<PatientCodeFormat, string>;
  year: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updatePatientCodeSettingsAction,
    null,
  );
  const [prefix, setPrefix] = useState(initialPrefix);
  const [format, setFormat] = useState<PatientCodeFormat>(initialFormat);

  const submitted = state !== null;
  const errors =
    submitted && state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  /**
   * While the prefix still matches what is saved, the server-computed preview is
   * exact and is shown as-is. Once the owner types a different prefix that value
   * would be a lie, so the preview falls back to the same rules applied locally
   * to the typed prefix. An empty string from the page (0055 RPC not applied
   * yet) takes the same fallback path instead of rendering a blank badge.
   */
  const typedPrefix = prefix.trim().toUpperCase();
  const serverPreview = previews[format];
  const shownPreview =
    typedPrefix === initialPrefix.toUpperCase() && serverPreview
      ? serverPreview
      : samplePatientCode(typedPrefix, format, year);

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 border-b border-hairline">
        <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-control bg-primary/10">
          <RefreshCw className="size-[18px] text-primary" aria-hidden="true" />
        </span>
        <div>
          <CardTitle>Patient ID format</CardTitle>
          <CardDescription className="mt-0.5">
            Customize the unique patient ID (UHID) shown to doctors and printed
            on prescriptions.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {submitted && !state.ok && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {submitted && state.ok && (
          <Alert variant="success">
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>Patient ID settings saved.</AlertDescription>
          </Alert>
        )}

        <form action={formAction} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">
                Patient ID prefix
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                Short code used to prefix every patient ID (e.g. clinic
                initials)
              </p>
            </div>
            <Input
              id="patient-code-prefix"
              name="prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              placeholder="AIQ"
              maxLength={6}
              disabled={!canWrite}
              aria-invalid={!!errors.prefix}
              aria-describedby={errors.prefix ? "prefix-error" : undefined}
              className="w-32 text-center font-semibold tracking-widest"
            />
          </div>
          {errors.prefix && (
            <p
              id="prefix-error"
              role="alert"
              className="-mt-3 flex items-start gap-1 text-xs font-medium text-status-destructive"
            >
              <AlertCircle
                aria-hidden="true"
                className="mt-px size-3.5 shrink-0"
              />
              <span>{errors.prefix}</span>
            </p>
          )}

          <hr className="border-hairline-soft" />

          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">
              ID format
            </p>
            <input type="hidden" name="format" value={format} />
            <div
              role="radiogroup"
              aria-label="ID format"
              className="grid grid-cols-1 gap-3 md:grid-cols-2"
            >
              {FORMATS.map((option) => {
                const active = format === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!canWrite}
                    onClick={() => setFormat(option.value)}
                    className={cn(
                      "rounded-control border-2 px-4 py-3 text-left transition-colors",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-text-muted/30 bg-surface hover:border-text-muted/60",
                    )}
                  >
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        active ? "text-primary" : "text-text-primary",
                      )}
                    >
                      {option.label}
                    </p>
                    <p className="mt-1 font-mono text-xs text-text-muted">
                      {option.example}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="border-hairline-soft" />

          <div className="flex items-center justify-between gap-3 rounded-control bg-primary/10 p-3 text-xs text-text-secondary">
            <span>Next patient ID will be:</span>
            <span className="font-mono font-bold text-primary">
              {shownPreview}
            </span>
          </div>

          <div className="flex items-start gap-2 rounded-control bg-status-warning/10 p-3 text-xs text-status-warning">
            <TriangleAlert
              aria-hidden="true"
              className="mt-px size-3.5 shrink-0"
            />
            <p>
              Changing this only affects new patients — existing patient IDs
              won&apos;t change.
            </p>
          </div>

          {canWrite && (
            <div className="flex justify-end">
              <SubmitButton loadingText="Saving…">Save changes</SubmitButton>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
