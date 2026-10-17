"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { ClipboardList, Receipt, CalendarClock } from "lucide-react";
import { toast } from "sonner";

import type {
  DermDiagnosis,
  DermExam,
  DermLesion,
  DermProcedure,
} from "@/types/database";
import {
  RecordEmpty,
  RecordSection,
} from "@/components/patients/record/record-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveDermExamAction } from "@/lib/actions/specialty-workspaces";

type Props = {
  patientId: string;
  exam: DermExam | null;
  diagnoses: DermDiagnosis[];
  lesions: DermLesion[];
  procedures: DermProcedure[];
  prescriptions: Array<{ id: string }>;
  canManage: boolean;
};

function SummaryFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-hairline bg-surface px-3 py-2">
      <span className="text-[12px] font-medium text-text-secondary">
        {label}
      </span>
      <span className="text-[13px] text-text-primary">{value ?? "—"}</span>
    </div>
  );
}

export function DermSummary({
  patientId,
  exam,
  diagnoses,
  lesions,
  procedures,
  prescriptions,
  canManage,
}: Props) {
  const [followUpDate, setFollowUpDate] = useState(exam?.follow_up_date ?? "");
  const [followUpNotes, setFollowUpNotes] = useState(
    exam?.follow_up_notes ?? "",
  );
  const [isPending, startTransition] = useTransition();
  const hasTodayExam = exam !== null;

  const primaryDiagnoses = diagnoses
    .filter((d) => d.status === "primary")
    .slice(0, 5);

  async function saveFollowUp() {
    if (!hasTodayExam) {
      toast.error("Create or load today's exam before saving follow-up");
      return;
    }
    startTransition(async () => {
      const result = await saveDermExamAction(patientId, {
        id: exam.id,
        follow_up_date: followUpDate.trim() ? followUpDate.trim() : null,
        follow_up_notes: followUpNotes.trim() ? followUpNotes.trim() : null,
      });
      if (result.ok) {
        toast.success("Follow-up saved");
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <RecordSection title="Encounter recap">
        {hasTodayExam ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryFact label="Exam date" value={exam.exam_date || "—"} />
            <SummaryFact
              label="Diagnoses (primary)"
              value={primaryDiagnoses.length}
            />
            <SummaryFact label="Lesions" value={lesions.length} />
            <SummaryFact label="Procedures" value={procedures.length} />
            <SummaryFact label="Prescriptions" value={prescriptions.length} />
          </div>
        ) : (
          <RecordEmpty
            icon={ClipboardList}
            title="No exam for today"
            description="Complete other tabs first; the summary will populate automatically."
          />
        )}
        {primaryDiagnoses.length > 0 && (
          <div className="mt-3 space-y-1 text-[13px] text-text-secondary">
            {primaryDiagnoses.map((d) => (
              <div key={d.id}>
                {d.label}
                {d.icd_code ? ` (${d.icd_code})` : ""}
              </div>
            ))}
          </div>
        )}
      </RecordSection>

      <RecordSection title="Billing">
        <p className="text-[13px] text-text-secondary">
          Billing uses the existing pricing catalogue and payment services; no
          hard-coded amounts. Charges reflect configured items and procedures.
        </p>
        <RecordEmpty
          icon={Receipt}
          title="No billing line items"
          description="Honest placeholder; billing integration is a remaining backend gap."
        />
      </RecordSection>

      <RecordSection title="Follow-up">
        {!hasTodayExam && (
          <RecordEmpty
            icon={CalendarClock}
            title="Today's exam not found"
            description="Save exam details on other tabs before setting follow-up."
          />
        )}
        {hasTodayExam && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-text-secondary">
                  Follow-up date
                </label>
                <Input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  disabled={!canManage}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-text-secondary">
                Follow-up notes
              </label>
              <Textarea
                rows={3}
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                placeholder="Instructions, timing, red flags"
                disabled={!canManage}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={saveFollowUp} disabled={!canManage || isPending}>
                {isPending ? "Saving..." : "Save follow-up"}
              </Button>
            </div>
          </div>
        )}
      </RecordSection>
    </div>
  );
}
