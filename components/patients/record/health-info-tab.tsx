"use client";

import { HistorySummaryRibbon } from "@/components/patients/record/history-summary-ribbon";
import { PastHistoryFields } from "@/components/patients/record/past-history-fields";
import { StructuredMedicalHistory } from "@/components/patients/record/structured-history";
import type { PatientDirectoryRow } from "@/types/database";
import type { HistoryItem } from "@/types/history";

/** Split a comma/newline separated free-text field into displayable chips. */
function entries(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * History — what is on file about the person rather than about a visit.
 *
 * The ribbon up top summarises the four numbers a doctor most wants at a
 * glance (chronic conditions, past surgeries, family risk factors, pending
 * approvals). Below it, structured Medical History lists the record newest
 * first as individual items with provenance and a one-click Verify, and Past
 * History renders the six free-text answers from `docs/HEALTH INFO.txt` as
 * read-only tiles that expand into the reference textareas on Edit. That last
 * part is why there is no modal and no Save button in this tab: the panel is
 * already the edit surface, and a doctor reading history should not have to
 * open anything to read it. `PastHistoryFields` carries its own heading and
 * toggle for the same reason — the control belongs next to what it controls,
 * not floating between two panels.
 *
 * Blood group, height, weight and BMI live on the Overview's Basic information
 * card instead. Demographics also fall away — they are already in the header.
 */
export function HealthInfoTab({
  patient,
  medicalHistory,
  canManage,
}: {
  patient: PatientDirectoryRow;
  medicalHistory: HistoryItem[];
  canManage: boolean;
}) {
  const conditions = entries(patient.medical_conditions);
  const surgeries = entries(patient.past_surgeries);
  // The ribbon's risk card is about family history (high-risk hereditary
  // conditions), not allergies — allergies already have their own home on the
  // Overview's Critical Safety Alerts block.
  const familyRisks = entries(patient.family_history);
  // The ribbon's pending card is driven by real structured entries awaiting
  // clinician approval (AI OCR / patient intake) — each one carries a Verify
  // button in the section below.
  const pendingItems = medicalHistory.filter(
    (item) => item.verification_status === "pending_approval",
  );

  const pastHistory = {
    past_illnesses: patient.past_illnesses,
    past_surgeries: patient.past_surgeries,
    hospitalizations: patient.hospitalizations,
    family_history: patient.family_history,
    personal_history: patient.personal_history,
    immunization_history: patient.immunization_history,
  };

  return (
    <div className="tab-fade-in space-y-4">
      <HistorySummaryRibbon
        chronicConditions={{
          count: conditions.length,
          tags: conditions,
        }}
        pastSurgeries={{
          count: surgeries.length,
          tags: surgeries,
        }}
        criticalRisks={{
          count: familyRisks.length,
          tags: familyRisks,
        }}
        pendingApproval={{
          count: pendingItems.length,
          tags: pendingItems.map((item) => item.title),
        }}
      />

      {/* Structured Medical History — the record as a single flat list, newest
          first, with provenance, clinical status and one-click verification.
          Grouping by category was tried first and dropped: with one chronic
          condition and three allergies it produced two single-row panels and a
          heading, which is more chrome than record. The category now travels
          with each row instead of around a group of them. */}
      <StructuredMedicalHistory
        items={medicalHistory}
        patientId={patient.id}
        patientFirstName={patient.name.split(" ")[0]}
        canManage={canManage}
      />

      {/* Past History — the six prompts from `docs/HEALTH INFO.txt`. The section
          brings its own heading and its own Edit toggle, so the control sits
          with the thing it controls instead of floating between two panels. */}
      <PastHistoryFields
        patientId={patient.id}
        values={pastHistory}
        canManage={canManage}
      />
    </div>
  );
}
