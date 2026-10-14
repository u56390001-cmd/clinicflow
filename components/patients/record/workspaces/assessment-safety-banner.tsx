"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { updateAssessmentReviewStatusAction } from "@/lib/actions/specialty-workspaces";
import {
  ACTIVE_SAFETY_REVIEW_STATUSES,
  assessmentReviewStatusLabel,
  riskLevelLabel,
} from "@/lib/scoring/labels";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/utils/datetime";
import type { PsychAssessment, PsychAssessmentReviewStatus } from "@/types/database";

/** Provider triage actions surfaced on the banner, per current state. */
const ACTIONS: Array<{
  status: Exclude<PsychAssessmentReviewStatus, "CLEAR" | "PENDING_REVIEW">;
  label: string;
  tone: "neutral" | "primary" | "critical";
}> = [
  { status: "UNDER_REVIEW", label: "Start review", tone: "neutral" },
  { status: "ACTIONED_SAFETY_PLAN", label: "Safety plan recorded", tone: "primary" },
  { status: "ESCALATED_EMERGENCY", label: "Escalate emergency", tone: "critical" },
  { status: "RESOLVED", label: "Resolve", tone: "neutral" },
];

const RISK_TONE: Record<string, string> = {
  HIGH: "border-red-300 bg-red-50",
  MODERATE: "border-amber-300 bg-amber-50",
  NONE: "border-hairline bg-surface",
  LOW: "border-hairline bg-surface",
};

const RISK_BADGE: Record<string, string> = {
  HIGH: "bg-red-600 text-white",
  MODERATE: "bg-amber-500 text-white",
  LOW: "bg-slate-400 text-white",
  NONE: "bg-slate-300 text-slate-700",
};

/**
 * Phase 1 §2.2 — the persistent clinical safety banner.
 *
 * Rendered above every psychology tab whenever a scored assessment carries an
 * unresolved safety flag. A credentialed provider records their triage action
 * here; each action appends an immutable `assessment_safety_events` transition
 * and an audit entry (server-side).
 */
export function AssessmentSafetyBanner({
  assessments,
  canManage,
}: {
  assessments: PsychAssessment[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  const active = assessments
    .filter(
      (assessment) =>
        assessment.safety_flag_raised &&
        ACTIVE_SAFETY_REVIEW_STATUSES.includes(assessment.review_status),
    )
    .sort((a, b) => (a.conducted_at < b.conducted_at ? 1 : -1));

  if (active.length === 0) return null;

  async function act(assessment: PsychAssessment, status: string, label: string) {
    if (pending) return;
    setPending(`${assessment.id}:${status}`);
    const result = await updateAssessmentReviewStatusAction({
      assessment_id: assessment.id,
      status,
      rationale: "",
    });
    setPending(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(label);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {active.map((assessment) => {
        const risk = assessment.risk_level;
        const urgent = risk === "HIGH";
        return (
          <div
            key={assessment.id}
            role="alert"
            className={cn(
              "rounded-panel border px-4 py-3 shadow-sm",
              RISK_TONE[risk] ?? RISK_TONE.NONE,
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                    urgent ? "bg-red-600 text-white" : "bg-amber-500 text-white",
                  )}
                >
                  {urgent ? (
                    <ShieldAlert aria-hidden="true" className="size-4" />
                  ) : (
                    <AlertTriangle aria-hidden="true" className="size-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-bold text-text-primary">
                      {urgent ? "High-risk" : "Safety flag"} · {assessment.instrument_code ?? assessment.assessment_type}
                    </p>
                    <span
                      className={cn(
                        "rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        RISK_BADGE[risk] ?? RISK_BADGE.NONE,
                      )}
                    >
                      {riskLevelLabel(risk)}
                    </span>
                    <span className="rounded-pill bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                      {assessmentReviewStatusLabel(assessment.review_status)}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
                    Raised {formatShortDate(assessment.conducted_at)} from a patient-completed
                    {assessment.instrument_code ? ` ${assessment.instrument_code}` : ""} assessment.
                    {assessment.severity ? ` Severity: ${assessment.severity}.` : ""} Review the
                    responses and record the triage action below.
                  </p>
                </div>
              </div>

              {canManage && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {ACTIONS.filter(
                    (action) => action.status !== assessment.review_status,
                  ).map((action) => {
                    const isPending = pending === `${assessment.id}:${action.status}`;
                    return (
                      <Button
                        key={action.status}
                        type="button"
                        size="sm"
                        variant={action.tone === "critical" ? "destructive" : "secondary"}
                        disabled={pending !== null}
                        onClick={() => act(assessment, action.status, action.label)}
                        className="gap-1.5"
                      >
                        {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        {action.label}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
