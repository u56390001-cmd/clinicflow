"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Stethoscope } from "lucide-react";

import { ConfirmDeleteButton } from "@/components/patients/record/workspaces/confirm-delete";
import { TerminologySearch } from "@/components/patients/record/workspaces/terminology-search";
import { RecordSection } from "@/components/patients/record/record-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteDermDiagnosisAction,
  saveDermDiagnosisAction,
} from "@/lib/actions/specialty-workspaces";
import { cn } from "@/lib/utils";
import type { DermDiagnosis } from "@/types/database";

type DiagnosisStatus = DermDiagnosis["status"];

const STATUS_OPTIONS: { value: DiagnosisStatus; label: string }[] = [
  { value: "primary", label: "Primary" },
  { value: "provisional", label: "Provisional" },
  { value: "suspected", label: "Suspected" },
  { value: "differential", label: "Differential" },
];

const STATUS_TONE: Record<DiagnosisStatus, string> = {
  primary: "border-primary bg-primary/10 text-primary",
  provisional: "border-status-info/40 bg-status-info/10 text-status-info",
  suspected:
    "border-status-warning/40 bg-status-warning/10 text-status-warning",
  differential: "border-hairline bg-surface-muted text-text-secondary",
};

/** Common starting terms for fast entry. Plain labels — tapping one only fills
 *  the label. The diagnosis field itself searches the coded catalog
 *  (migration 0101), so picking a hit supplies the label and its ICD code. */
const COMMON_TERMS = [
  "Acne vulgaris",
  "Atopic dermatitis",
  "Psoriasis vulgaris",
  "Tinea corporis",
  "Urticaria",
  "Contact dermatitis",
  "Seborrheic dermatitis",
  "Vitiligo",
  "Melasma",
  "Folliculitis",
  "Verruca vulgaris",
  "Herpes zoster",
] as const;

export function DermDiagnoses({
  patientId,
  examId,
  diagnoses,
  canManage,
  visitId,
}: {
  patientId: string;
  examId: string | null;
  diagnoses: DermDiagnosis[];
  canManage: boolean;
  /** Active visit/encounter stamp for new diagnoses — migration 0104. */
  visitId?: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    label: string;
    icd_code: string;
    status: DiagnosisStatus;
    notes: string;
  }>({ label: "", icd_code: "", status: "primary", notes: "" });

  async function add() {
    const label = form.label.trim();
    if (!label) {
      toast.error("Enter a diagnosis label.");
      return;
    }
    setSaving(true);
    const result = await saveDermDiagnosisAction(
      patientId,
      {
        exam_id: examId ?? "",
        label,
        icd_code: form.icd_code,
        status: form.status,
        notes: form.notes,
      },
      visitId,
    );
    setSaving(false);
    if (result.ok) {
      setForm({ label: "", icd_code: "", status: "primary", notes: "" });
      toast.success("Diagnosis recorded");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function updateStatus(id: string, status: DiagnosisStatus) {
    const result = await saveDermDiagnosisAction(patientId, { id, status });
    if (result.ok) {
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function remove(id: string) {
    const result = await deleteDermDiagnosisAction(id);
    if (result.ok) {
      toast.success("Diagnosis removed");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  const primary = diagnoses.filter((d) => d.status === "primary");
  const others = diagnoses.filter((d) => d.status !== "primary");

  return (
    <RecordSection
      title="Diagnosis & clinical assessment"
      meta={
        diagnoses.length > 0
          ? `${diagnoses.length} recorded`
          : "Nothing recorded yet"
      }
    >
      {diagnoses.length === 0 ? (
        <p className="text-[13px] text-text-muted">
          No diagnosis recorded for this patient yet. Add a working diagnosis,
          then any differentials you are keeping in mind.
        </p>
      ) : (
        <ul className="space-y-2">
          {[...primary, ...others].map((diagnosis) => (
            <li
              key={diagnosis.id}
              className="flex items-start justify-between gap-3 rounded-card border border-hairline bg-surface p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                      STATUS_TONE[diagnosis.status],
                    )}
                  >
                    {diagnosis.status}
                  </span>
                  <span className="text-ink text-[13.5px] font-semibold">
                    {diagnosis.label}
                  </span>
                  {diagnosis.icd_code && (
                    <span className="font-mono text-[11.5px] text-text-muted">
                      {diagnosis.icd_code}
                    </span>
                  )}
                </div>
                {diagnosis.notes && (
                  <p className="mt-1 text-[12.5px] text-text-secondary">
                    {diagnosis.notes}
                  </p>
                )}
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <NativeSelect
                    aria-label="Diagnosis status"
                    className="h-8 w-[130px] text-[12px]"
                    value={diagnosis.status}
                    onChange={(event) =>
                      void updateStatus(
                        diagnosis.id,
                        event.target.value as DiagnosisStatus,
                      )
                    }
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <ConfirmDeleteButton
                    title="Remove diagnosis?"
                    description={`"${diagnosis.label}" will be removed from this patient's record.`}
                    onConfirm={() => remove(diagnosis.id)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="mt-4 space-y-3 rounded-card border border-hairline p-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-ink text-[12.5px] font-bold">Add a diagnosis</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {COMMON_TERMS.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() =>
                  setForm((current) => ({ ...current, label: term }))
                }
                className="rounded-full border border-hairline px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary"
              >
                {term}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_130px_150px]">
            <TerminologySearch
              label="Diagnosis"
              inputId="dx-label"
              value={form.label}
              placeholder="e.g. Atopic dermatitis"
              onChange={(next) =>
                setForm((current) => ({ ...current, label: next }))
              }
              onSelect={(hit) =>
                setForm((current) => ({
                  ...current,
                  label: hit.display,
                  icd_code: hit.code,
                }))
              }
            />
            <div>
              <label
                htmlFor="dx-icd"
                className="text-ink mb-1.5 block text-[12px] font-bold"
              >
                ICD code
              </label>
              <Input
                id="dx-icd"
                value={form.icd_code}
                placeholder="L20.9"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    icd_code: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label
                htmlFor="dx-status"
                className="text-ink mb-1.5 block text-[12px] font-bold"
              >
                Status
              </label>
              <NativeSelect
                id="dx-status"
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as DiagnosisStatus,
                  }))
                }
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <Textarea
            id="dx-notes"
            rows={2}
            value={form.notes}
            placeholder="Reasoning or supporting findings (optional)"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
          />

          <div className="flex justify-end">
            <Button type="button" onClick={add} disabled={saving}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {saving ? "Saving…" : "Add diagnosis"}
            </Button>
          </div>
        </div>
      )}
    </RecordSection>
  );
}
