"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  LabOrder,
  MedicineEntry,
  Prescription,
} from "@/types/database";

/**
 * The live value of every editable prescription field. One shape, shared by
 * the tab form (as its source of truth) and the voice copilot (as its write
 * target) — the copilot never touches DOM inputs, it patches this object.
 */
export type PrescriptionDraft = {
  chiefComplaint: string;
  findings: string;
  diagnosis: string;
  customDiagnosis: string;
  medicines: MedicineEntry[];
  labOrders: LabOrder[];
  followUpDate: string;
  followUpNotes: string;
  doctorNotes: string;
};

/** The blank row `MedicineEntry` starts with — same default the form used before this context existed. */
export const BLANK_MEDICINE: MedicineEntry = {
  name: "",
  route: "",
  form: "",
  frequency: "",
  duration: "",
  unit: "",
  instructions: "",
};

/** Seed a draft from the saved row, exactly the way the form's own `useState` initialisers did. */
export function draftFromPrescription(prescription: Prescription | null): PrescriptionDraft {
  return {
    chiefComplaint: prescription?.chief_complaint ?? "",
    findings: prescription?.findings ?? "",
    diagnosis: prescription?.diagnosis ?? "",
    customDiagnosis: prescription?.custom_diagnosis ?? "",
    medicines: prescription?.medicines?.length
      ? prescription.medicines
      : [{ ...BLANK_MEDICINE }],
    labOrders: prescription?.lab_orders?.length ? prescription.lab_orders : [],
    followUpDate: prescription?.follow_up_date ?? "",
    followUpNotes: prescription?.follow_up_notes ?? "",
    doctorNotes: prescription?.doctor_notes ?? "",
  };
}

/**
 * The context the Prescription tab runs on.
 *
 * WHY it exists: tabs are URL-driven, so switching `?tab=` unmounts the tab's
 * React tree — a doctor who hops to History to check a previous prescription
 * would lose half-typed medicines. The draft therefore lives here, mounted at
 * `PatientRecord` (which never unmounts while the record is open), keyed by
 * visit so a second visit today can never inherit the first one's half-entry.
 *
 * WHY the shape it has: `patch` merges a partial draft (typing one field must
 * not rewrite nine), and every patch clears the `applied` marks on exactly the
 * fields it touched — that is the rule "an AI-filled field stays amber until
 * the doctor edits it" (the copilot calls `patch` then `markApplied`, in that
 * order, so the mark survives its own application).
 */
export type PrescriptionDraftContextValue = {
  /** Visit the draft belongs to; `null` until a form mounts and seeds it. */
  visitId: string | null;
  draft: PrescriptionDraft | null;
  /** Field keys last written by the copilot — the form rings them amber. */
  applied: Partial<Record<keyof PrescriptionDraft, true>>;
  /** Adopt `seed` unless this exact visit's draft already exists. */
  ensure: (visitId: string, seed: PrescriptionDraft) => void;
  patch: (updates: Partial<PrescriptionDraft>) => void;
  markApplied: (keys: (keyof PrescriptionDraft)[]) => void;
  /** Drop every AI mark — a successful save IS the doctor's confirmation. */
  clearApplied: () => void;
};

const PrescriptionDraftContext =
  createContext<PrescriptionDraftContextValue | null>(null);

export function PrescriptionDraftProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSession] = useState<{
    visitId: string;
    draft: PrescriptionDraft;
    applied: Partial<Record<keyof PrescriptionDraft, true>>;
  } | null>(null);

  const ensure = useCallback(
    (visitId: string, seed: PrescriptionDraft) => {
      setSession((prev) => {
        if (prev?.visitId !== visitId)
          return { visitId, draft: seed, applied: {} };
        // The form re-runs `ensure` on every provider change (tab switches
        // included). Returning the same object for a no-op keeps React from
        // re-rendering the subtree — and, critically, preserves `applied`:
        // a reset here would wipe the copilot's amber marks whenever the
        // doctor hops tabs mid-review.
        return prev;
      });
    },
    [],
  );

  const patch = useCallback((updates: Partial<PrescriptionDraft>) => {
    setSession((prev) => {
      if (!prev) return prev;
      const applied = { ...prev.applied };
      // A manual write to a field clears its AI mark — that is the whole
      // review-feedback lifecycle, so it belongs to the state, not the UI.
      for (const key of Object.keys(updates) as (keyof PrescriptionDraft)[]) {
        delete applied[key];
      }
      return { ...prev, draft: { ...prev.draft, ...updates }, applied };
    });
  }, []);

  const markApplied = useCallback(
    (keys: (keyof PrescriptionDraft)[]) => {
      setSession((prev) => {
        if (!prev) return prev;
        const applied = { ...prev.applied };
        for (const key of keys) applied[key] = true;
        return { ...prev, applied };
      });
    },
    [],
  );

  const clearApplied = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, applied: {} } : prev));
  }, []);

  const value = useMemo<PrescriptionDraftContextValue>(
    () => ({
      visitId: session?.visitId ?? null,
      draft: session?.draft ?? null,
      applied: session?.applied ?? {},
      ensure,
      patch,
      markApplied,
      clearApplied,
    }),
    [session, ensure, patch, markApplied, clearApplied],
  );

  return (
    <PrescriptionDraftContext.Provider value={value}>
      {children}
    </PrescriptionDraftContext.Provider>
  );
}

/** Raw access for the copilot (needs `ensure`/`patch` even when it is not the form). */
export function usePrescriptionDraft() {
  return useContext(PrescriptionDraftContext);
}

/**
 * The form's bridge: a live draft *for this visit*, or `null` — which is what
 * the overlay and `/app/consultation` always get (they render outside any
 * provider), so the form falls back to internal state and behaves exactly as
 * it did before tabs existed.
 */
export function usePrescriptionDraftBridge(
  visitId: string,
): PrescriptionDraftContextValue | null {
  const ctx = useContext(PrescriptionDraftContext);
  return ctx && ctx.visitId === visitId ? ctx : null;
}
