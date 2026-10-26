"use client";

import { useEffect } from "react";

import { clinicLogoPublicUrl } from "@/lib/clinic-logo-url";
import { parseList } from "@/components/patients/record/workspaces/specialty-form";
import { PSYCH_GOAL_STATUS_META } from "@/components/patients/record/workspaces/care-plan-goal-builder";
import type { PsychCarePlan } from "@/types/database";

/**
 * 🖨 Formal Treatment Plan report (single page, clinic letterhead).
 * Mount-then-print, same pattern as the assessment print surface: the
 * `<style>` block hides everything else when `window.print()` fires.
 */

export type CarePlanLetterhead = {
  name: string;
  phone: string | null;
  address: string | null;
  logoPath: string | null;
};

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

export function CarePlanPrint({
  plan,
  patient,
  letterhead,
  clinician,
}: {
  plan: PsychCarePlan;
  patient: {
    name: string;
    patient_code: string | null;
    date_of_birth: string | null;
    gender: string | null;
  };
  letterhead: CarePlanLetterhead | null;
  clinician: string;
}) {
  // Mount, paint, then print.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.print();
    }, 60);
    return () => window.clearTimeout(timer);
  }, []);

  const logoUrl = clinicLogoPublicUrl(letterhead?.logoPath ?? null);
  const goals = plan.goals ?? [];
  const interventions = parseList(plan.intervention_plan);
  const homework = parseList(plan.homework_assignments);
  const age = ageLabel(patient.date_of_birth);
  const gender = patient.gender
    ? (GENDER_LABEL[patient.gender] ?? patient.gender)
    : null;
  const problems = plan.diagnosis_problem_list?.trim() ?? "";

  return (
    <div className="care-plan-print-preview hidden" id="care-plan-print-area">
      <style>{`
        @media print {
          .care-plan-print-preview { display: block !important; }
          body * { visibility: hidden; }
          .care-plan-print-preview, .care-plan-print-preview * { visibility: visible; }
          .care-plan-print-preview {
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
            <p className="text-xs font-medium text-text-muted">Prepared by</p>
            <p className="text-sm font-semibold text-text-primary">{clinician || "—"}</p>
          </div>
        </div>
      </div>

      {/* Title + referral badge */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-lg font-bold leading-snug text-text-primary">
          Treatment Plan — Clinical Care Plan
        </p>
        {plan.psychiatrist_referral && (
          <span className="border border-hairline px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-primary">
            Psychiatrist referral active
          </span>
        )}
      </div>

      {/* Patient demographics */}
      <div className="mb-4 grid grid-cols-4 gap-3 text-[12px]">
        <span><strong>Patient:</strong> {patient.name}</span>
        <span><strong>Age/Gender:</strong> {age ?? "—"} / {gender ?? "—"}</span>
        <span><strong>UHID:</strong> {patient.patient_code ?? "—"}</span>
        <span><strong>Next review:</strong> {plan.next_review_date ?? "—"}</span>
      </div>

      {/* Diagnosis & problem list */}
      <div className="mb-4 rounded border border-hairline bg-app p-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Diagnosis &amp; problem list
        </p>
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-text-primary">
          {problems || "Not recorded on this plan."}
        </p>
      </div>

      {/* SMART goals */}
      <div className="mb-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
          SMART goals ({goals.length})
        </p>
        {goals.length === 0 ? (
          <p className="border-b border-hairline/60 py-1.5 text-[12px] text-text-secondary">
            No structured goals recorded on this plan.
          </p>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-wider text-text-muted">
                <th className="py-1.5 pr-3 font-bold">#</th>
                <th className="py-1.5 pr-3 font-bold">Goal</th>
                <th className="py-1.5 pr-3 font-bold">Status</th>
                <th className="py-1.5 pr-3 font-bold">Baseline</th>
                <th className="py-1.5 pr-3 font-bold">Target</th>
                <th className="py-1.5 font-bold">Target date</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((goal, index) => (
                <tr key={goal.id ?? index} className="border-b border-hairline/60 align-top">
                  <td className="py-1.5 pr-3 font-mono text-text-muted">{index + 1}</td>
                  <td className="py-1.5 pr-3 leading-snug">{goal.title || "—"}</td>
                  <td className="py-1.5 pr-3 font-semibold">
                    {PSYCH_GOAL_STATUS_META[goal.status]?.label ?? goal.status}
                  </td>
                  <td className="py-1.5 pr-3">{goal.baseline_metric || "—"}</td>
                  <td className="py-1.5 pr-3">{goal.target_metric || "—"}</td>
                  <td className="py-1.5">{goal.target_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Interventions & homework matrix */}
      <div className="mb-4 grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Interventions
          </p>
          {interventions.length === 0 ? (
            <p className="border-b border-hairline/60 py-1.5 text-[12px] text-text-secondary">—</p>
          ) : (
            <ul className="text-[12px] leading-relaxed">
              {interventions.map((item) => (
                <li key={item} className="border-b border-hairline/60 py-1.5">• {item}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Homework assignments
          </p>
          {homework.length === 0 ? (
            <p className="border-b border-hairline/60 py-1.5 text-[12px] text-text-secondary">—</p>
          ) : (
            <ul className="text-[12px] leading-relaxed">
              {homework.map((item) => (
                <li key={item} className="border-b border-hairline/60 py-1.5">• {item}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Follow-up cadence */}
      <div className="mb-4 text-[12px]">
        <strong>Review cadence / follow-up:</strong>{" "}
        {plan.follow_up_frequency?.trim() || "—"}
        {plan.review_cadence_days ? (
          <span className="text-text-secondary">
            {" "}· plan review every {plan.review_cadence_days} days
          </span>
        ) : null}
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
            <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">Plan issued</p>
            <p className="text-xs text-text-primary">{new Date().toISOString().slice(0, 10)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
