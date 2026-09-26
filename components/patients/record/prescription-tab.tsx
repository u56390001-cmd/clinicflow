"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, CheckCircle, Printer, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PrescriptionForm } from "@/components/consultation/prescription-form";
import { PrescriptionPreview } from "@/components/consultation/prescription-preview";
import { completeAndAdvanceAction } from "@/lib/actions/consultation";
import { VISIT_STATUS_META, visitStatusTone } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ActiveVisitInfo } from "@/components/patients/record/record-banner";
import type {
  Doctor,
  Prescription,
  PrescriptionTemplate,
  Vitals,
} from "@/types/database";
import type { PatientDirectoryRow } from "@/types/database";

/**
 * Everything the Prescription tab needs about today's visit, fetched by the
 * server page in the same pass as the record itself. `null` on the pane means
 * "no active visit for this patient today" — the tab then shows a hint, never
 * a broken form.
 */
export type PrescriptionTabBundle = {
  visit: ActiveVisitInfo;
  /** The visit's own check-in instant — the printable visit date. */
  checkedInAt: string;
  /** Assigned at check-in; null until "Start Consultation" claims it. */
  doctorId: string | null;
  /** The assigned doctor's row — names and signs the printed Rx. */
  visitDoctor: Doctor | null;
  /** The saved row for this visit, until the first save lands. */
  prescription: Prescription | null;
  templates: PrescriptionTemplate[];
  vitals: Vitals | null;
};

/**
 * The Prescription tab — today's writing surface inside the patient record.
 *
 * This is the same `PrescriptionForm` the full-screen overlay uses, not a
 * fork: the overlay stays for doctors who like it, and this tab is where the
 * doctor who never leaves the record lives. The difference is that the form's
 * field values are lifted into the `PrescriptionDraftProvider` mounted above
 * (see `prescription-draft-context.tsx`), so hopping to History to recheck a
 * previous prescription and back does not lose a half-typed medicine row.
 *
 * Footer actions mirror the consultation screen rather than reinventing them:
 * Save (submits the form via `requestSubmit` — the form itself has no button,
 * same as the overlay), Print (`window.print()` over the print-isolated
 * `PrescriptionPreview`, only once a row exists), and Complete & Next (the
 * existing `completeAndAdvanceAction`, same green as the banner's).
 */
export function PrescriptionTab({
  bundle,
  patient,
  clinic,
  timezone,
  onCompleteAndNext,
}: {
  bundle: PrescriptionTabBundle | null;
  patient: PatientDirectoryRow;
  clinic: { name: string; address: string | null; phone: string | null };
  timezone: string;
  /** Same contract as the banner's: advance selection to the next patient. */
  onCompleteAndNext?: (nextPatientId: string) => void;
}) {
  const router = useRouter();
  const formHostRef = useRef<HTMLDivElement>(null);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [isAdvancing, startAdvance] = useTransition();

  const handleSave = useCallback(() => {
    // The <form> belongs to PrescriptionForm and owns no submit button of its
    // own (the overlay submits with Enter); requestSubmit is the codebase's
    // idiom for triggering one from outside.
    const form = formHostRef.current?.querySelector("form");
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }, []);

  const handleComplete = useCallback(() => {
    if (!bundle) return;
    setAdvanceError(null);
    startAdvance(async () => {
      const formData = new FormData();
      formData.set("visitId", bundle.visit.id);
      const res = await completeAndAdvanceAction(null, formData);
      if (!res.ok) {
        setAdvanceError(res.message);
        return;
      }
      // Same contract as the banner: navigate to whoever the queue advanced
      // to, else just refresh this patient's state (e.g. last patient).
      const nextPatientId = res.data;
      if (nextPatientId && onCompleteAndNext) {
        onCompleteAndNext(nextPatientId);
      } else {
        router.refresh();
      }
    });
  }, [bundle, onCompleteAndNext, router]);

  const visitDate = bundle
    ? new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: timezone,
      }).format(new Date(bundle.checkedInAt))
    : "";

  // After a save the server re-renders the tab with the saved row; re-enable
  // print the moment it exists. `state?.ok` inside PrescriptionForm already
  // fires router.refresh(), so this component simply receives the new bundle.
  const saved = bundle?.prescription ?? null;
  const statusMeta = bundle ? VISIT_STATUS_META[bundle.visit.status] : null;
  const statusTone = bundle ? visitStatusTone(bundle.visit.status) : null;

  if (!bundle) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-pill bg-app">
            <Activity aria-hidden="true" className="size-6 text-text-muted" />
          </div>
          <p className="text-sm font-semibold text-text-primary">
            No active visit today
          </p>
          <p className="max-w-sm text-[13px] leading-relaxed text-text-secondary">
            {patient.name.split(" ")[0]} is not checked in right now. Check them
            in from the queue (or Start their consultation in the banner above),
            and this tab opens for writing.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Visit strip: which encounter is being written, at a glance — token,
          queue state, and the vitals the nurse took, without leaving the tab. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-text-muted/15 bg-app px-4 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Today
        </span>
        {statusMeta && statusTone && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-bold leading-none",
              statusTone.pill,
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-[5px] rounded-pill",
                statusTone.dot,
                bundle.visit.status === "waiting" && "animate-pulse",
              )}
            />
            Token #{bundle.visit.tokenNumber} · {statusMeta.label}
          </span>
        )}
        <span className="text-[12.5px] text-text-secondary">{visitDate}</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Vitals
          </span>
          {bundle.vitals ? (
            <Badge variant="success" className="text-[10px]">
              {bundle.vitals.blood_pressure ?? "--"}
              {bundle.vitals.pulse ? ` · P ${bundle.vitals.pulse}` : ""}
              {bundle.vitals.temperature ? ` · ${bundle.vitals.temperature}°F` : ""}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              None recorded
            </Badge>
          )}
        </span>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div ref={formHostRef}>
            <PrescriptionForm
              visitId={bundle.visit.id}
              prescription={bundle.prescription}
              doctorId={bundle.doctorId}
              templates={bundle.templates}
            />
          </div>
        </CardContent>
      </Card>

      {/* Footer actions — Save (teal, primary), Print (outline, disabled until
          a row exists because the print sheet renders the SAVED prescription,
              same as the overlay), Complete & Next (green, the queue verb). */}
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <Button size="sm" onClick={handleSave} className="h-9 px-4 text-[12.5px] font-bold">
          <Save aria-hidden="true" className="size-4" />
          Save Prescription
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          disabled={!saved}
          title={
            saved
              ? "Print the saved prescription"
              : "Save the prescription first — printing shows the saved version"
          }
          className="h-9 border-primary/40 px-3.5 text-[12.5px] font-semibold text-primary hover:bg-primary/5"
        >
          <Printer aria-hidden="true" className="size-3.5" />
          Print Preview
        </Button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleComplete();
          }}
        >
          <Button
            type="submit"
            size="sm"
            disabled={isAdvancing}
            className="h-9 bg-status-success px-4 text-[12.5px] font-bold text-white hover:bg-status-success/90"
          >
            <CheckCircle aria-hidden="true" className="size-4" />
            {isAdvancing ? "Advancing..." : "Complete & Next"}
          </Button>
        </form>
        {advanceError && (
          <p className="text-xs text-status-destructive">{advanceError}</p>
        )}
      </div>

      {/* Print sheet — the tab's own copy, mounted only once a row exists, so
          the visibility-isolated print CSS picks exactly this element (the
          overlay, when open, is the only other mount point and cannot be open
          alongside this tab). */}
      {saved && (
        <PrescriptionPreview
          prescription={saved}
          patient={patient}
          doctor={bundle.visitDoctor}
          clinicName={clinic.name}
          clinicAddress={clinic.address}
          clinicPhone={clinic.phone}
          visitDate={visitDate}
          vitals={bundle.vitals}
        />
      )}
    </div>
  );
}
