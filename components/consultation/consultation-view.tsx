"use client";

import { useActionState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  User,
  Activity,
  CheckCircle,
  ListChecks,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VitalsForm } from "@/components/queue/vitals-form";
import { PrescriptionForm } from "@/components/consultation/prescription-form";
import { PrescriptionPreview } from "@/components/consultation/prescription-preview";
import { useDoctorVitalsConfig } from "@/hooks/use-doctor-vitals-config";
import {
  completeAndAdvanceAction,
} from "@/lib/actions/consultation";
import type { ActionResult } from "@/types";
import type { ConsultationData } from "@/lib/consultation-queries";
import type { DoctorVitalsConfigMap } from "@/lib/vitals-config";
import type { PrescriptionTemplate } from "@/types/database";

/**
 * Full consultation view — patient sidebar (details + vitals) and main
 * prescription form. Includes "Complete & Next Patient" button.
 */
export function ConsultationView({
  data,
  templates,
  timezone,
  clinic,
  backHref,
  allowAdvance = true,
  onBack,
  onAdvanceSuccess,
  vitalsConfigs,
}: {
  data: ConsultationData;
  templates: PrescriptionTemplate[];
  timezone: string;
  clinic: { name: string; address: string | null; phone: string | null };
  /**
   * When set, the back arrow returns here instead of the waiting list — used
   * when the screen is deep-linked from a patient record (Write Prescription).
   */
  backHref?: string;
  /** When false, the "Complete & Next" action is hidden (non-consultation visits). */
  allowAdvance?: boolean;
  /** Optional handler that fully replaces the default back navigation (overlay use). */
  onBack?: () => void;
  /** Called after "Complete & Next" succeeds — overlay closes on completion. */
  onAdvanceSuccess?: () => void;
  /** Server-fetched doctor → vitals config map; skips the client fetch. */
  vitalsConfigs?: DoctorVitalsConfigMap | null;
}) {
  const router = useRouter();
  const { visit, patient, doctor, service, vitals, prescription, answers } = data;
  const vitalsConfig = useDoctorVitalsConfig(doctor?.id ?? null, vitalsConfigs);

  const [advanceState, advanceFormAction, isAdvancing] = useActionState<
    ActionResult<string> | null,
    FormData
  >(completeAndAdvanceAction, null);

  useEffect(() => {
    if (advanceState?.ok) {
      router.refresh();
      onAdvanceSuccess?.();
    }
  }, [advanceState?.ok, router, onAdvanceSuccess]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const visitDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date(visit.checked_in_at));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (onBack) {
                onBack();
              } else if (backHref) {
                router.push(backHref);
              } else {
                router.push("/app/consultation");
              }
            }}
            aria-label={backHref ? "Back to patients" : "Back to waiting list"}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-secondary">
              Consultation
            </h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              {patient.name} · {service?.name ?? "Walk-in"} · Token #{visit.token_number}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            Print Preview
          </Button>
          {allowAdvance && (
            <form action={advanceFormAction}>
              <input type="hidden" name="visitId" value={visit.id} />
              <Button
                type="submit"
                size="sm"
                disabled={isAdvancing}
                className="bg-status-success text-white hover:bg-status-success/90"
              >
                {isAdvancing ? (
                  "Processing..."
                ) : (
                  <>
                    <CheckCircle className="mr-1 h-4 w-4" aria-hidden="true" />
                    Complete & Next
                  </>
                )}
              </Button>
            </form>
          )}
        </div>
      </div>

      {advanceState && !advanceState.ok && (
        <p className="text-xs text-status-destructive">{advanceState.message}</p>
      )}

      <div className="grid grid-cols-[300px_1fr] gap-6">
        {/* Left Sidebar — Patient Details + Vitals */}
        <div className="space-y-4">
          {/* Patient Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-primary" aria-hidden="true" />
                Patient Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Name</span>
                <p className="text-sm font-medium text-text-primary">{patient.name}</p>
              </div>
              {patient.phone && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Phone</span>
                  <p className="text-sm text-text-primary">{patient.phone}</p>
                </div>
              )}
              {patient.email && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Email</span>
                  <p className="text-sm text-text-primary">{patient.email}</p>
                </div>
              )}
              {patient.date_of_birth && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Date of Birth</span>
                  <p className="text-sm text-text-primary">{patient.date_of_birth}</p>
                </div>
              )}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Visit Date</span>
                <p className="text-sm text-text-primary">{visitDate}</p>
              </div>
              {doctor && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Doctor</span>
                  <p className="text-sm text-text-primary">
                    Dr. {doctor.name}
                    {doctor.specialty ? ` — ${doctor.specialty}` : ""}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pre-Consultation Answers Card (Phase 22) */}
          {answers.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
                  Pre-Consultation Questions
                  {answers.length > 0 && (
                    <Badge variant="success" className="ml-auto text-[10px]">
                      Collected
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {answers.map((answer) => (
                  <div key={answer.id}>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      {answer.question?.question_text ?? "Question"}
                    </span>
                    <p className="mt-0.5 text-sm whitespace-pre-wrap text-text-primary">
                      {answer.answer_text}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Vitals Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
                Vitals
                {vitals && (
                  <Badge variant="success" className="ml-auto text-[10px]">
                    Recorded
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <VitalsForm
                visitId={visit.id}
                existingVitals={vitals}
                config={
                  vitalsConfig.status === "ready" ? vitalsConfig.config : undefined
                }
                configLoading={vitalsConfig.status === "loading"}
              />
            </CardContent>
          </Card>
        </div>

        {/* Main — Prescription Form */}
        <Card>
          <CardContent className="pt-6">
            <PrescriptionForm
              visitId={visit.id}
              prescription={prescription}
              doctorId={doctor?.id ?? null}
              templates={templates}
            />
          </CardContent>
        </Card>
      </div>

      {/* Print-only prescription with doctor signature (hidden on screen) */}
      {prescription && (
        <PrescriptionPreview
          prescription={prescription}
          patient={patient}
          doctor={doctor}
          clinicName={clinic.name}
          clinicAddress={clinic.address}
          clinicPhone={clinic.phone}
          visitDate={visitDate}
          vitals={vitals}
        />
      )}
    </div>
  );
}
