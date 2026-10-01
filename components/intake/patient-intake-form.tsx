"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { submitPatientPreIntakeAction } from "@/lib/actions/patient-intake-actions";
import {
  INTAKE_CATEGORIES,
  INTAKE_CATEGORY_LABELS,
} from "@/lib/medical-history-mapping";
import type { IntakeHistoryCategory } from "@/types/database";

type IntakeRow = {
  category: IntakeHistoryCategory;
  condition: string;
  onset: string;
  relationship: string;
};

const CATEGORY_OPTIONS = INTAKE_CATEGORIES.map((category) => (
  <option key={category} value={category}>
    {INTAKE_CATEGORY_LABELS[category]}
  </option>
));

function emptyRow(): IntakeRow {
  return { category: "past_illness", condition: "", onset: "", relationship: "" };
}

/**
 * The patient-facing pre-intake form (module 1).
 *
 * A mobile-first, dynamic list of history rows — category, condition, optional
 * year, and a relationship field that only appears for family history. Rows
 * with no condition are silently dropped on submit; empty rows with a real
 * condition flow through as `pending_approval` / `patient_intake` rows the
 * clinic verifies on the History tab. After a successful submit the whole form
 * swaps to a quiet confirmation — there is nothing else for a patient to do
 * there.
 */
export function PatientIntakeForm({
  preview,
  token,
}: {
  preview: { patientFirstName: string; clinicName: string };
  token: string;
}) {
  const [rows, setRows] = useState<IntakeRow[]>([emptyRow()]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);

  function setRow(index: number, patch: Partial<IntakeRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (working) return;

    const complete = rows.filter((row) => row.condition.trim().length > 0);
    if (complete.length === 0) {
      setError("Add at least one condition, surgery or other item below.");
      return;
    }

    setWorking(true);
    setError(null);

    const data = new FormData();
    data.set("token", token);
    data.set(
      "items",
      JSON.stringify(
        complete.map((row) => ({
          category: row.category,
          condition_name: row.condition.trim(),
          onset_date: row.onset.trim() || null,
          relationship: row.relationship.trim() || null,
        })),
      ),
    );

    void submitPatientPreIntakeAction(null, data).then((result) => {
      setWorking(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSubmittedCount(complete.length);
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="rounded-panel border border-hairline bg-surface px-6 py-12 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100">
          <Check aria-hidden="true" className="size-7 text-emerald-600" />
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-text-primary">
          Submitted
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
          {submittedCount === 1
            ? "Your health history is on its way"
            : `Your ${submittedCount} health history entries are on their way`}{" "}
          to{" "}
          <span className="font-medium text-text-primary">{preview.clinicName}</span>
          . A staff member will review them before your visit.
        </p>
        <p className="mt-6 text-xs text-text-muted">You can close this page now.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
        {preview.clinicName}
      </p>
      <h1 className="mt-1 text-2xl font-extrabold text-text-primary">
        {preview.patientFirstName ? `${preview.patientFirstName}'s` : "Your"} health
        history
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
        Help us prepare for your visit — add any past illnesses, surgeries,
        hospitalizations or family history you think we should know about.
      </p>

      <form
        onSubmit={submit}
        className="mt-5 rounded-panel border border-hairline bg-white p-5 shadow-sm"
      >
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col gap-4">
          {rows.map((row, index) => {
            const idPrefix = `intake-item-${index}`;
            const canRemove = rows.length > 1;
            return (
              <div
                key={index}
                className="rounded-panel border border-hairline bg-surface/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
                      {index + 1}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                      History item
                    </span>
                  </div>
                  {canRemove && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-m-1 px-1.5 text-slate-400 hover:text-red-600"
                      aria-label={`Remove item ${index + 1}`}
                      onClick={() =>
                        setRows((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      <X aria-hidden="true" className="size-4" />
                    </Button>
                  )}
                </div>

                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor={`${idPrefix}-category`}
                      className="text-[10px] font-bold uppercase tracking-wider text-ink-faint"
                    >
                      Category
                    </Label>
                    <NativeSelect
                      id={`${idPrefix}-category`}
                      value={row.category}
                      onChange={(event) =>
                        setRow(index, {
                          category: event.target.value as IntakeHistoryCategory,
                        })
                      }
                    >
                      {CATEGORY_OPTIONS}
                    </NativeSelect>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor={`${idPrefix}-condition`}
                      className="text-[10px] font-bold uppercase tracking-wider text-ink-faint"
                    >
                      Condition{" "}
                      <span className="normal-case text-text-muted">/ procedure</span>
                    </Label>
                    <Input
                      id={`${idPrefix}-condition`}
                      value={row.condition}
                      onChange={(event) => setRow(index, { condition: event.target.value })}
                      placeholder={
                        row.category === "surgery"
                          ? "e.g. Appendectomy"
                          : row.category === "family_history"
                            ? "e.g. Diabetes"
                            : row.category === "immunization"
                              ? "e.g. COVID-19 vaccine"
                              : "e.g. Diabetes Type 2"
                      }
                      maxLength={160}
                    />
                  </div>

                  {row.category === "family_history" && (
                    <div className="flex flex-col gap-1.5">
                      <Label
                        htmlFor={`${idPrefix}-relationship`}
                        className="text-[10px] font-bold uppercase tracking-wider text-ink-faint"
                      >
                        Relationship
                      </Label>
                      <Input
                        id={`${idPrefix}-relationship`}
                        value={row.relationship}
                        onChange={(event) =>
                          setRow(index, { relationship: event.target.value })
                        }
                        placeholder="e.g. Father"
                        maxLength={80}
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor={`${idPrefix}-onset`}
                      className="text-[10px] font-bold uppercase tracking-wider text-ink-faint"
                    >
                      When did it start?{" "}
                      <span className="normal-case font-medium text-text-muted">(optional)</span>
                    </Label>
                    <Input
                      id={`${idPrefix}-onset`}
                      value={row.onset}
                      onChange={(event) => setRow(index, { onset: event.target.value })}
                      placeholder="e.g. 2018"
                      maxLength={60}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full border-dashed text-[13px]"
          onClick={() => setRows((prev) => [...prev, emptyRow()])}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add another item
        </Button>

        <Button
          type="submit"
          className="mt-4 w-full"
          disabled={working || rows.every((row) => row.condition.trim().length === 0)}
        >
          {working ? (
            <>
              <Spinner size="sm" />
              Sending…
            </>
          ) : (
            <>
              <Check aria-hidden="true" className="size-4" />
              Submit for review
            </>
          )}
        </Button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-text-muted">
          Shared privately with {preview.clinicName} only. A staff member will
          confirm your entries before your visit.
        </p>
      </form>
    </div>
  );
}