"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronsRight,
  GitMerge,
  PenLine,
  Play,
  TriangleAlert,
  UserRoundPen,
  Clock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  completeAndAdvanceAction,
  startConsultationAction,
} from "@/lib/actions/consultation";
import { VISIT_STATUS_META, visitStatusTone } from "@/lib/constants";
import { avatarColorFor, initialsOf } from "@/lib/utils/avatar";
import { ageFromDob } from "@/lib/utils/datetime";
import { calculateBMI } from "@/lib/patient-record";
import { cn } from "@/lib/utils";
import type { PatientDirectoryRow, VisitStatus } from "@/types/database";

const GENDER_LABELS: Record<"male" | "female" | "other", string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

/** A visit this patient has today that is still in progress. */
export type ActiveVisitInfo = {
  id: string;
  status: VisitStatus;
  tokenNumber: number;
};

/**
 * The fixed header of the patient workspace. It stays pinned while the record
 * scrolls, so the four things a doctor must never have to go looking for — who
 * this is, what they are allergic to, what they already have, and what to press
 * next — are on screen for the whole consultation.
 *
 * Deliberately a band, not a card: no radius, no shadow, a hairline under the
 * tab strip. It is chrome for the workspace, and chrome should read as part of
 * the frame rather than as one more piece of content inside it.
 */
export function RecordBanner({
  patient,
  canManage,
  canMerge,
  activeVisit,
  canStart,
  onEdit,
  onMergeDuplicate,
  onWritePrescription,
  onCompleteAndNext,
}: {
  patient: PatientDirectoryRow;
  canManage: boolean;
  canMerge: boolean;
  activeVisit: ActiveVisitInfo | null;
  canStart: boolean;
  onEdit: () => void;
  onMergeDuplicate: () => void;
  onWritePrescription: (visitId: string) => void;
  onCompleteAndNext?: (nextPatientId: string) => void;
}) {
  const router = useRouter();
  const [isBusy, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [consultationTimer, setConsultationTimer] = useState<number>(0);

  const handleStart = (formData: FormData) => {
    setActionError(null);
    startTransition(async () => {
      const res = await startConsultationAction(null, formData);
      if (!res.ok) {
        setActionError(res.message);
        return;
      }
      router.refresh();
    });
  };

  const handleComplete = (formData: FormData) => {
    setActionError(null);
    startTransition(async () => {
      const res = await completeAndAdvanceAction(null, formData);
      if (!res.ok) {
        setActionError(res.message);
        return;
      }
      const nextPatientId = res.data;
      if (nextPatientId && onCompleteAndNext) {
        onCompleteAndNext(nextPatientId);
      } else {
        router.refresh();
      }
    });
  };

  const genderLabel = patient.gender ? GENDER_LABELS[patient.gender] : null;
  const age = ageFromDob(patient.date_of_birth) ?? patient.age;
  const statusMeta = activeVisit ? VISIT_STATUS_META[activeVisit.status] : null;
  const statusTone = activeVisit ? visitStatusTone(activeVisit.status) : null;
  const allergies = patient.known_allergies?.trim() || null;
  const conditions = patient.medical_conditions?.trim() || null;

  if (activeVisit?.status === "in_consultation") {
    setConsultationTimer((prev) => (prev >= 0 ? prev + 1 : 0));
  }

  const bmiInfo = calculateBMI(patient.height, patient.weight);
  const minutes = Math.floor(consultationTimer / 60);
  const seconds = consultationTimer % 60;
  const consultationTimeStr = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;

  const visitCount = patient.visit_count ?? 0;
  const daysSinceLastVisit = patient.last_visit_at
    ? Math.floor(
        (Date.now() - new Date(patient.last_visit_at).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  if (activeVisit?.status === "in_consultation") {
    setConsultationTimer((prev) => (prev >= 0 ? prev + 1 : 0));
  }

  const bmiInfo = calculateBMI(patient.height, patient.weight);
  const minutes = Math.floor(consultationTimer / 60);
  const seconds = consultationTimer % 60;
  const consultationTimeStr = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;

  const metaNodes: React.ReactNode[] = [];
  if (age !== null) {
    metaNodes.push(
      <span key="age" className="tabular-nums">
        {age} yrs
      </span>,
    );
  }
  if (genderLabel) {
    metaNodes.push(<span key="gender">{genderLabel}</span>);
  }
  if (patient.phone) {
    metaNodes.push(<span key="phone">{patient.phone}</span>);
  }
  if (patient.patient_code) {
    metaNodes.push(
      <span key="uhid" className="font-mono font-semibold text-teal-600">
        UHID {patient.patient_code}
      </span>,
    );
  }
  if (patient.blood_group) {
    metaNodes.push(
      <span
        key="blood_group"
        className="inline-flex items-center rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-700"
      >
        {patient.blood_group}
      </span>,
    );
  }
  if (bmiInfo.bmi !== null) {
    metaNodes.push(
      <span
        key="bmi"
        className="inline-flex items-center rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-700"
      >
        BMI: {bmiInfo.bmi} - {bmiInfo.category}
      </span>,
    );
  }

  return (
    <div className="bg-slate-50/80">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full text-base font-bold",
              avatarColorFor(patient.id),
            )}
          >
            {initialsOf(patient.name)}
          </span>

          <div className="min-w-0">
            <h2 className="min-w-0 truncate text-xl font-bold tracking-tight text-slate-900">
              {patient.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500 mt-1">
              <span className="tabular-nums">{age || "N/A"} yrs</span>
              {genderLabel && <span>{genderLabel}</span>}
              {patient.phone && <span>{patient.phone}</span>}
              {patient.blood_group && (
                <span className="inline-flex items-center rounded-md bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700">
                  {patient.blood_group}
                </span>
              )}
              {bmiInfo.bmi !== null && (
                <span className="inline-flex items-center rounded-md bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700">
                  BMI: {bmiInfo.bmi} - {bmiInfo.category}
                </span>
              )}
              {patient.patient_code && (
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-700">
                  UHID: {patient.patient_code}
                </span>
              )}
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                Visit #{visitCount}
              </span>
              {daysSinceLastVisit !== null && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  Last seen: {daysSinceLastVisit} days ago
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          {activeVisit?.status === "in_consultation" && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1">
              <span className="text-xs font-semibold text-emerald-700">
                [✓ Bill Paid]
              </span>
            </div>
          )}
          {activeVisit && (
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 border border-teal-200 px-3 py-1">
              <Clock aria-hidden="true" className="size-4 text-teal-600" />
              <span className="text-xs font-bold text-teal-700">
                ⏱️ {consultationTimeStr} mins
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-200/80 px-5 py-2.5">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
          {allergies && (
            <div className="inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-200 px-3 py-1">
              <TriangleAlert aria-hidden="true" className="size-4 text-red-600" />
              <span className="text-xs font-semibold text-red-700">
                ⚠️ ALLERGY: {allergies}
              </span>
            </div>
          )}
          {conditions && (
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1">
              <TriangleAlert aria-hidden="true" className="size-4 text-amber-600" />
              <span className="text-xs font-semibold text-amber-700">
                🩸 {conditions}
              </span>
            </div>
          )}
          {!allergies && !conditions && (
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 border border-slate-200 px-3 py-1">
              <span className="text-xs font-semibold text-slate-600">
                No Known Allergies
              </span>
            </div>
          )}
        </div>
      </div>

      {actionError && (
        <p className="px-5 pb-2 text-xs text-red-600">{actionError}</p>
      )}
    </div>
  );
}
