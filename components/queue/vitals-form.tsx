"use client";

import { useEffect, useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordVitalsAction } from "@/lib/actions/queue";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";
import type { CustomVitalValue, DoctorVitalsConfig } from "@/types/database";

type ExistingVitals = {
  blood_pressure: string | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  temperature: number | null;
  pulse: number | null;
  weight: number | null;
  height: number | null;
  spo2: number | null;
  respiratory_rate: number | null;
  bmi: number | null;
  custom_vitals?: CustomVitalValue[] | null;
};

type StandardVitalMeta = {
  key: string;
  label: string;
  unit: string;
  placeholder: string;
  min?: number;
  max?: number;
  step?: string;
  /** Free-text input (e.g. "120/80") instead of a numeric field. */
  text?: boolean;
};

/** Standard vitals in canonical order (keys match the new vitals config). */
const STANDARD_VITALS: StandardVitalMeta[] = [
  {
    key: "blood_pressure",
    label: "Blood Pressure",
    unit: "mmHg",
    placeholder: "120/80",
    text: true,
  },
  { key: "pulse", label: "Pulse", unit: "bpm", placeholder: "72", min: 30, max: 300 },
  {
    key: "temperature",
    label: "Temperature",
    unit: "°F",
    placeholder: "98.6",
    min: 85,
    max: 115,
    step: "0.1",
  },
  { key: "spo2", label: "SpO₂", unit: "%", placeholder: "98", min: 0, max: 100 },
  {
    key: "respiratory_rate",
    label: "Respiratory Rate",
    unit: "breaths/min",
    placeholder: "16",
    min: 4,
    max: 60,
  },
  { key: "weight", label: "Weight", unit: "kg", placeholder: "70", min: 1, max: 500, step: "0.1" },
  { key: "height", label: "Height", unit: "cm", placeholder: "170", min: 1, max: 300, step: "0.1" },
];

/**
 * Map pre-redesign config keys (split systolic/diastolic BP) onto the single
 * Blood Pressure key so earlier doctor configs keep working.
 */
function normalizeStandardKeys(keys: string[] | null): string[] {
  const seen = new Set<string>();
  for (const key of keys ?? []) {
    if (key === "systolic_bp" || key === "diastolic_bp") {
      seen.add("blood_pressure");
    } else {
      seen.add(key);
    }
  }
  return [...seen];
}

/**
 * Full vitals capture form — 2-column grid layout, driven by a per-doctor
 * vitals config (Phase 20). The doctor's `standard_vitals` list picks which
 * built-in fields appear (null = all); `custom_vitals` add clinic-defined
 * fields whose values are recorded into `vitals.custom_vitals`. BMI always
 * derives from height + weight when both are on the form.
 *
 * `configLoading` must be passed while the doctor's config is still being
 * fetched: without it the form flashes the full field set and then drops the
 * fields the config disables a beat later (grid visibly re-flows).
 */
export function VitalsForm({
  visitId,
  existingVitals,
  config,
  configLoading = false,
}: {
  visitId: string;
  existingVitals?: ExistingVitals | null;
  config?: DoctorVitalsConfig | null;
  configLoading?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    ActionResult<string> | null,
    FormData
  >(recordVitalsAction, null);

  // Height + weight are controlled so BMI can be recalculated live while the
  // receptionist types instead of waiting for a save/refresh round-trip.
  const [heightInput, setHeightInput] = useState(() =>
    existingVitals?.height != null ? String(existingVitals.height) : "",
  );
  const [weightInput, setWeightInput] = useState(() =>
    existingVitals?.weight != null ? String(existingVitals.weight) : "",
  );

  // Re-sync from the persisted row whenever the server hands back new values
  // (first open with data recorded elsewhere, or after a save + refresh).
  useEffect(() => {
    setHeightInput(existingVitals?.height != null ? String(existingVitals.height) : "");
  }, [existingVitals?.height]);
  useEffect(() => {
    setWeightInput(existingVitals?.weight != null ? String(existingVitals.weight) : "");
  }, [existingVitals?.weight]);

  // Refresh the queue/modal after a successful save so the saved BMI, the
  // "Vitals Done" badge, and the queue list all reflect the new row.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  // Custom vital values — controlled so their JSON can be serialized.
  const customDefinitions = config?.custom_vitals ?? [];
  const [customValues, setCustomValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const vital of existingVitals?.custom_vitals ?? []) {
      initial[vital.key] = vital.value;
    }
    return initial;
  });

  const customVitalsJson = JSON.stringify(
    customDefinitions
      .map((vital) => ({
        key: vital.key,
        label: vital.label,
        value: customValues[vital.key] ?? "",
        unit: vital.unit,
      }))
      .filter((row) => row.value.trim() !== ""),
  );

  // Visible standard vitals: the doctor's config bubbles, or everything when
  // the config is absent/null (pre-config behavior).
  const configured = normalizeStandardKeys(config?.standard_vitals ?? null);
  const visibleStandard = configured.length
    ? STANDARD_VITALS.filter((vital) => configured.includes(vital.key))
    : STANDARD_VITALS;
  // BMI is derived, never an independent field: show it whenever height AND
  // weight are on the form (or the doctor explicitly enabled "bmi"). It must
  // not vanish when the doctor's config loads without a "bmi" key.
  const showBMI =
    configured.includes("bmi") ||
    (visibleStandard.some((v) => v.key === "height") &&
      visibleStandard.some((v) => v.key === "weight"));

  // BMI auto-computation from the height (cm) + weight (kg) currently typed in
  // the form — recalculates on every keystroke.
  const computedBmi = useMemo(() => {
    const h = Number(heightInput);
    const w = Number(weightInput);
    if (h > 0 && w > 0) {
      const heightM = h / 100;
      return (w / (heightM * heightM)).toFixed(1);
    }
    return null;
  }, [heightInput, weightInput]);

  const systolic = existingVitals?.systolic_bp;
  const diastolic = existingVitals?.diastolic_bp;
  const derivedBp =
    systolic && diastolic ? `${systolic}/${diastolic}` : existingVitals?.blood_pressure ?? "";

  const standardValue = (key: string): number | string => {
    switch (key) {
      case "blood_pressure":
        return derivedBp;
      case "temperature":
        return existingVitals?.temperature ?? "";
      case "pulse":
        return existingVitals?.pulse ?? "";
      case "spo2":
        return existingVitals?.spo2 ?? "";
      case "respiratory_rate":
        return existingVitals?.respiratory_rate ?? "";
      case "weight":
        return existingVitals?.weight ?? "";
      case "height":
        return existingVitals?.height ?? "";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-text-primary">Patient Vitals</h3>
      </div>

      {configLoading ? (
        <div role="status" aria-busy="true" className="space-y-4">
          <span className="sr-only">Loading vitals fields…</span>
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="space-y-1.5">
                <div className="h-3 w-20 animate-pulse rounded bg-app" />
                <div className="h-10 animate-pulse rounded-control bg-app" />
              </div>
            ))}
          </div>
          <div className="ml-auto h-8 w-28 animate-pulse rounded-control bg-app" />
        </div>
      ) : (
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="visitId" value={visitId} />
        <input type="hidden" name="customVitalsJson" value={customVitalsJson} />

        {(visibleStandard.length > 0 || showBMI) && (
          <div className="grid grid-cols-2 gap-4">
            {visibleStandard.map((vital) => {
              // Height + weight are controlled so BMI recalculates live.
              const tracked =
                vital.key === "height"
                  ? ("height" as const)
                  : vital.key === "weight"
                    ? ("weight" as const)
                    : null;
              return (
                <div key={vital.key} className="space-y-1.5">
                  <Label
                    htmlFor={`vital-${vital.key}`}
                    className="text-xs font-bold uppercase tracking-wider text-text-muted"
                  >
                    {vital.label} ({vital.unit})
                  </Label>
                  {tracked ? (
                    <Input
                      id={`vital-${vital.key}`}
                      name={vital.key}
                      type="number"
                      inputMode="decimal"
                      min={vital.min}
                      max={vital.max}
                      step={vital.step}
                      placeholder={vital.placeholder}
                      value={tracked === "height" ? heightInput : weightInput}
                      onChange={(event) =>
                        tracked === "height"
                          ? setHeightInput(event.target.value)
                          : setWeightInput(event.target.value)
                      }
                    />
                  ) : vital.text ? (
                    <Input
                      id={`vital-${vital.key}`}
                      name={vital.key}
                      type="text"
                      placeholder={vital.placeholder}
                      defaultValue={standardValue(vital.key)}
                    />
                  ) : (
                    <Input
                      id={`vital-${vital.key}`}
                      name={vital.key}
                      type="number"
                      inputMode="decimal"
                      min={vital.min}
                      max={vital.max}
                      step={vital.step}
                      placeholder={vital.placeholder}
                      defaultValue={standardValue(vital.key)}
                    />
                  )}
                </div>
              );
            })}

            {/* BMI — read-only, always derived from Height + Weight */}
            {showBMI && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  BMI (kg/m²)
                </Label>
                <div
                  aria-live="polite"
                  title="Auto-calculated from height and weight"
                  className="flex h-10 w-full items-center rounded-control border border-text-muted/40 bg-app px-3 py-2 text-sm font-semibold text-text-primary"
                >
                  {computedBmi ?? (
                    <span className="font-normal text-text-muted">
                      Enter height &amp; weight
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-muted">Auto-calculated</p>
              </div>
            )}
          </div>
        )}

        {customDefinitions.length > 0 && (
          <div className="space-y-3 rounded-control border border-neutral-borderLight bg-app/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Additional vitals
            </p>
            <div className="grid grid-cols-2 gap-4">
              {customDefinitions.map((vital) => (
                <div key={vital.key} className="space-y-1.5">
                  <Label
                    htmlFor={`cv-${vital.key}`}
                    className="text-xs font-bold uppercase tracking-wider text-text-muted"
                  >
                    {vital.label}
                    {vital.unit ? ` (${vital.unit})` : ""}
                  </Label>
                  <Input
                    id={`cv-${vital.key}`}
                    type="text"
                    inputMode={vital.type === "text" ? "text" : "decimal"}
                    placeholder={vital.placeholder ?? undefined}
                    value={customValues[vital.key] ?? ""}
                    onChange={(event) =>
                      setCustomValues((prev) => ({
                        ...prev,
                        [vital.key]: event.target.value,
                      }))
                    }
                    className={cn(existingVitals?.custom_vitals?.some((v) => v.key === vital.key) ? "border-primary/40" : "")}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {state && !state.ok && (
          <p className="text-xs text-status-destructive">{state.message}</p>
        )}

        {state?.ok && (
          <p className="text-xs text-status-success">Vitals recorded successfully.</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Saving..." : existingVitals ? "Update Vitals" : "Save Vitals"}
          </Button>
        </div>
      </form>
      )}
    </div>
  );
}