"use client";

import { useEffect } from "react";

import { catalogEntryByKey, interpretationForScore, templateMaxScore } from "@/lib/assessment-library";
import { clinicLogoPublicUrl } from "@/lib/clinic-logo-url";
import { getInstrument } from "@/lib/scoring";
import {
  PSYCHOMETRIC_INSTRUMENTS,
  isPsychometricKey,
} from "@/lib/psychometrics";
import { cn } from "@/lib/utils";
import type {
  AssessmentTemplate,
  PsychAssessment,
} from "@/types/database";

/**
 * 🖨 Formal clinical assessment report (single page, clinic letterhead).
 * Follows the same mount-then-print pattern as the session-note print surface:
 * the `<style>` block hides everything else when `window.print()` fires.
 */

export type AssessmentLetterhead = {
  name: string;
  phone: string | null;
  address: string | null;
  logoPath: string | null;
};

const MODE_LABEL: Record<string, string> = {
  SELF_REPORT: "Self (online / desk form)",
  PROXY: "Informant (proxy)",
  CLINICIAN_ENTERED: "Clinician-administered",
};

function administrationModeLabel(value: string | null): string {
  if (!value) return "Self";
  return MODE_LABEL[value] ?? value;
}

/** Age in completed years from a yyyy-mm-dd date of birth, or null. */
function ageLabel(dob: string | null): string | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) years -= 1;
  return years >= 0 && years < 130 ? `${years} yrs` : null;
}

const GENDER_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  unknown: "Not stated",
};

export type ItemisedAnswer = { text: string; value: number | null | undefined };

/** Item-level answers mapped to display text (template first, instrument bank second). */
export function responsesFor(
  assessment: PsychAssessment,
  template: AssessmentTemplate | null,
): ItemisedAnswer[] {
  if (!assessment.answers) return [];
  if (template) {
    return template.questions
      .filter((q) => q.type !== "text")
      .map((q) => ({ text: q.text, value: assessment.answers?.[q.id] }));
  }
  const code = assessment.instrument_code ?? assessment.assessment_type;
  if (isPsychometricKey(assessment.assessment_type)) {
    return PSYCHOMETRIC_INSTRUMENTS[assessment.assessment_type].items.map((item) => ({
      text: item.text,
      value: assessment.answers?.[item.id],
    }));
  }
  const def = getInstrument(code);
  if (def) {
    return def.items.map((item) => ({ text: item.text, value: assessment.answers?.[item.id] }));
  }
  return Object.entries(assessment.answers).map(([id, value]) => ({ text: id, value }));
}

/** Narrative interpretation: cached AI result, else the authored rule book. */
function interpretationFor(
  assessment: PsychAssessment,
  template: AssessmentTemplate | null,
): { text: string; source: "ai" | "rule" } | null {
  if (assessment.score === null) return null;
  if (template && template.interpretation.length > 0) {
    const rule = interpretationForScore(template.interpretation, assessment.score);
    if (rule) return { text: rule, source: "rule" };
  }
  const catalog = catalogEntryByKey(assessment.assessment_type);
  if (catalog && catalog.interpretation.length > 0) {
    const rule = interpretationForScore(catalog.interpretation, assessment.score);
    if (rule) return { text: rule, source: "rule" };
  }
  return null;
}

export function AssessmentPrint({
  assessment,
  template,
  patient,
  letterhead,
  clinician,
  previous,
}: {
  assessment: PsychAssessment;
  template: AssessmentTemplate | null;
  patient: {
    name: string;
    patient_code: string | null;
    date_of_birth: string | null;
    gender: string | null;
  };
  letterhead: AssessmentLetterhead | null;
  clinician: string;
  previous: PsychAssessment | null;
}) {
  // Mount, paint, then print — mirrors the session-note print surface.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.print();
    }, 60);
    return () => window.clearTimeout(timer);
  }, []);

  const logoUrl = clinicLogoPublicUrl(letterhead?.logoPath ?? null);
  const responses = responsesFor(assessment, template);
  const interpretation = interpretationFor(assessment, template);
  const ceiling = template
    ? templateMaxScore(template.scoring)
    : (getInstrument(assessment.instrument_code ?? assessment.assessment_type)?.scoring.maxScore ?? null);

  // Subscale table (DASS-21 D/A/S). The short form publishes bands on the
  // DOUBLED subscale sums, so the ×2 value is shown beside the raw sum.
  const dass = getInstrument(assessment.instrument_code ?? assessment.assessment_type)?.code === "DASS-21";
  const subscaleRows =
    assessment.subscale_scores && Object.keys(assessment.subscale_scores).length > 0
      ? (() => {
          const def = getInstrument(assessment.instrument_code ?? assessment.assessment_type);
          const labelById = new Map((def?.subscales ?? []).map((s) => [s.id, s.label]));
          return Object.entries(assessment.subscale_scores).map(([id, value]) => ({
            label: labelById.get(id) ?? id,
            raw: value,
            scaled: dass ? value * 2 : null,
          }));
        })()
      : [];

  const delta =
    previous?.score !== null && previous?.score !== undefined && assessment.score !== null
      ? assessment.score - previous.score
      : null;

  const age = ageLabel(patient.date_of_birth);
  const gender = patient.gender ? (GENDER_LABEL[patient.gender] ?? patient.gender) : null;

  return (
    <div className="assessment-print-preview hidden" id="assessment-print-area">
      <style>{`
        @media print {
          .assessment-print-preview { display: block !important; }
          body * { visibility: hidden; }
          .assessment-print-preview, .assessment-print-preview * { visibility: visible; }
          .assessment-print-preview {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 36px 40px;
            background: white;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>

      {/* Clinic letterhead */}
      <div className="mb-5 border-b-2 border-text-primary pb-4">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {logoUrl && (
                <img src={logoUrl} alt="" className="h-14 w-14 border border-hairline object-contain" />
              )}
              <div className="min-w-0">
                <h1 className="truncate text-base font-extrabold uppercase tracking-widest text-text-primary">
                  {letterhead?.name ?? "Clinic"}
                </h1>
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                  {letterhead?.phone ? `${letterhead.phone}` : ""}
                  {letterhead?.phone && letterhead?.address ? " · " : ""}
                  {letterhead?.address ?? ""}
                </p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-text-muted">Administered by</p>
            <p className="text-sm font-semibold text-text-primary">{clinician || "—"}</p>
          </div>
        </div>
      </div>

      {/* Patient demographics */}
      <div className="mb-4 grid grid-cols-5 gap-3 text-[12px]">
        <span><strong>Patient:</strong> {patient.name}</span>
        <span><strong>Age/Gender:</strong> {age ?? "—"} / {gender ?? "—"}</span>
        <span><strong>UHID:</strong> {patient.patient_code ?? "—"}</span>
        <span><strong>Date:</strong> {assessment.conducted_at}</span>
        <span><strong>Mode:</strong> {administrationModeLabel(assessment.administration_mode ?? null)}</span>
      </div>

      {/* Instrument summary */}
      <div className="mb-4">
        <p className="text-lg font-bold leading-snug text-text-primary">{assessment.assessment_type}</p>
        {assessment.score !== null && (
          <p className="mt-0.5 text-sm text-text-secondary">
            Total score <strong className="text-text-primary">{assessment.score}{ceiling ? `/${ceiling}` : ""}</strong>
            {assessment.severity ? <> · Severity <strong className="text-text-primary">{assessment.severity}</strong></> : null}
            {delta !== null && delta !== 0 ? (
              <span className={cn("ml-2 font-semibold", delta < 0 ? "text-emerald-700" : "text-red-700")}>
                {delta > 0 ? "+" : "−"}{Math.abs(delta)} pts since last administration
              </span>
            ) : delta === 0 ? (
              <span className="ml-2 text-[11px] font-semibold text-text-muted">No change since last administration</span>
            ) : null}
          </p>
        )}
        {assessment.risk_level && assessment.risk_level !== "NONE" && (
          <p className="mt-1 text-xs font-bold text-red-700">
            Safety flag raised · Risk level {assessment.risk_level}
          </p>
        )}
      </div>

      {/* Subscale breakdown */}
      {subscaleRows.length > 0 && (
        <div className="mb-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">Subscale breakdown</p>
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {subscaleRows.map((row) => (
                <tr key={row.label} className="border-t border-hairline">
                  <td className="py-1.5 pr-4 font-medium">{row.label}</td>
                  <td className="py-1.5 pr-4 text-right font-mono">{row.raw}</td>
                  {row.scaled !== null && <td className="py-1.5 text-right font-mono">×2 = {row.scaled}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Item-level answers */}
      {responses.length > 0 && (
        <div className="mb-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">Item-level answers</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[11.5px]">
            {responses.map((response, index) => (
              <div key={index} className="flex items-baseline justify-between gap-2 border-b border-hairline/60 py-1">
                <span className="min-w-0 flex-1 leading-snug text-text-secondary">
                  {index + 1}. {response.text}
                </span>
                <span className="font-mono font-semibold text-text-primary">{response.value ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interpretation */}
      <div className="mb-4 rounded border border-hairline bg-app p-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
          {interpretation?.source === "ai" ? "Clinical interpretation (AI-assisted)" : "Clinical interpretation (authored rule)"}
        </p>
        <p className="text-[12.5px] leading-relaxed text-text-primary">
          {interpretation?.text ?? "No interpretation recorded for this administration."}
        </p>
        {assessment.notes?.trim() ? (
          <p className="mt-2 text-[11.5px] italic leading-relaxed text-text-secondary">Notes: {assessment.notes.trim()}</p>
        ) : null}
        <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-text-muted">
          Clinical interpretation for authorized medical use only
        </p>
      </div>

      {/* Signature footer */}
      <div className="mt-10 border-t border-hairline pt-5">
        <div className="flex items-end justify-between gap-8">
          <div className="text-center">
            <div className="mb-2 h-px w-56 bg-text-primary" />
            <p className="text-sm font-semibold text-text-primary">{clinician || "Clinician"}</p>
            <p className="text-[11px] text-text-secondary">Psychologist / clinician signature</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">License / credential</p>
            <p className="text-xs text-text-secondary">____________________</p>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">Report issued</p>
            <p className="text-xs text-text-primary">{new Date().toISOString().slice(0, 10)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
