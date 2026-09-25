"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, X } from "lucide-react";

import { ConsultationView } from "@/components/consultation/consultation-view";
import { Spinner } from "@/components/ui/spinner";
import {
  fetchConsultationData,
  fetchPrescriptionTemplates,
  findDoctorForUser,
  type ConsultationData,
} from "@/lib/consultation-queries";
import { createClient } from "@/lib/supabase/client";
import type { PrescriptionTemplate } from "@/types/database";

/**
 * Full-screen Write Prescription overlay opened from the patient record.
 * Fetches the visit's consultation data on the client and renders the same
 * prescription workspace inside an overlay, so the doctor stays on the
 * patient tab instead of navigating to the separate Consultation page.
 */
export function WritePrescriptionOverlay({
  visitId,
  patientId,
  clinic,
  timezone,
  onClose,
}: {
  visitId: string;
  patientId: string;
  clinic: { id: string; name: string; address: string | null; phone: string | null };
  timezone: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [data, setData] = useState<ConsultationData | null>(null);
  const [templates, setTemplates] = useState<PrescriptionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const consultation = await fetchConsultationData(
          supabase,
          clinic.id,
          visitId,
        );
        if (cancelled) return;
        if (!consultation) {
          setError("We couldn't load this visit's data. It may already be complete.");
          setLoading(false);
          return;
        }
        setData(consultation);

        const doctor = await findDoctorForUser(supabase, clinic.id);
        if (doctor) {
          const tpl = await fetchPrescriptionTemplates(
            supabase,
            clinic.id,
            doctor.id,
          );
          if (!cancelled) setTemplates(tpl);
        }
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Something went wrong while loading this visit.");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId, clinic.id]);

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

  const handleBack = useCallback(() => onClose(), [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-app p-2 sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Write Prescription"
    >
      {/* Rounded, bordered card so the popup has visible left / right /
          bottom edges (matches the reference: a white sheet sitting inside
          the page with a hairline border and soft shadow). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-text-muted/20 bg-surface shadow-2xl">
      {/* Loading / Error state */}
      {loading || !data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          {error ? (
            <>
              <p className="text-sm text-text-secondary">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-control border border-text-muted/40 px-4 py-2 text-sm font-medium text-text-primary hover:bg-app"
              >
                Close
              </button>
            </>
          ) : (
            <>
              <Spinner size="lg" />
              <p className="text-sm text-text-secondary">Loading prescription…</p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Overlay header */}
          <div className="relative flex flex-shrink-0 items-center justify-between bg-gradient-to-r from-primary to-primary-light px-5 py-3 text-white">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                aria-label="Back to patients"
                className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-semibold text-white transition-all hover:bg-white/20"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back to Patients
              </button>
              <span aria-hidden="true" className="h-5 w-px bg-white/25" />
              <div>
                <h2 className="text-base font-bold leading-tight">Write Prescription</h2>
                <p className="mt-0.5 text-xs text-white/80">
                  {data.patient.name}
                  {data.patient.gender ? ` · ${data.patient.gender}` : ""}
                  {" · "}
                  {new Intl.DateTimeFormat("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: timezone,
                  }).format(new Date(data.visit.checked_in_at))}
                </p>
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

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <ConsultationView
              data={data}
              templates={templates}
              timezone={timezone}
              clinic={{
                name: clinic.name,
                address: clinic.address,
                phone: clinic.phone,
              }}
              backHref={`/app/patients?id=${patientId}`}
              onBack={handleBack}
              allowAdvance={true}
              onAdvanceSuccess={handleBack}
            />
          </div>
        </>
      )}
      </div>
    </div>
  );
}