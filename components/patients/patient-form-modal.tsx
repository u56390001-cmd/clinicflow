"use client";

import { useEffect } from "react";
import { X, UserRound } from "lucide-react";

import { PatientForm } from "@/components/patients/patient-form";
import {
  createPatientAction,
  updatePatientAction,
} from "@/lib/actions/patients";
import type { Patient } from "@/types/database";

/**
 * Add / edit patient in an overlay, styled after the reference
 * `docs/add patient html css js.txt` design (gradient header banner + two
 * column form body + footer with secure-data note).
 */
export function PatientFormModal({
  patient,
  onClose,
}: {
  /** `null` opens a blank form; a patient opens it prefilled for editing. */
  patient: Patient | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const isEdit = Boolean(patient);
  const title = isEdit ? "Edit Patient" : "Add Patient";
  const subtitle = isEdit ? "Update the patient record" : "Register a new patient record";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* ── Gradient header ───────────────────────────────────────────── */}
        <div className="relative flex-shrink-0 bg-gradient-to-r from-primary to-primary-light px-6 py-4 text-white">
          <div className="absolute inset-0 bg-black/5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="rounded-lg bg-white/20 p-2 backdrop-blur-sm">
                <UserRound aria-hidden="true" className="h-[18px] w-[18px]" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight">{title}</h2>
                <p className="mt-0.5 text-xs text-white/80">{subtitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-xl p-2 transition-all hover:bg-white/20"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Two-column form body + footer ─────────────────────────────── */}
        <PatientForm
          action={patient ? updatePatientAction : createPatientAction}
          patient={patient ?? undefined}
          onDone={onClose}
        />
      </div>
    </div>
  );
}