"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Plus, Stethoscope } from "lucide-react";

import { DoctorForm } from "@/components/doctors/doctor-form";
import { DoctorVisibilityButton } from "@/components/doctors/doctor-visibility-button";
import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createDoctorAction,
  deleteDoctorAction,
  updateDoctorAction,
} from "@/lib/actions/doctors";
import { formatCurrency } from "@/lib/utils/currency";
import type { ActionResult } from "@/types";
import type {
  Doctor,
  DoctorSlotTemplate,
  DoctorVitalsConfig,
} from "@/types/database";

type Mode =
  | { view: "list" }
  | { view: "form"; editing: Doctor | null };

export function DoctorsManager({
  initialDoctors,
  initialSlotTemplates = [],
  initialVitalsConfigs = [],
  clinicId,
  canWrite,
}: {
  initialDoctors: Doctor[];
  initialSlotTemplates?: DoctorSlotTemplate[];
  initialVitalsConfigs?: DoctorVitalsConfig[];
  clinicId: string;
  canWrite: boolean;
}) {
  const [mode, setMode] = useState<Mode>({ view: "list" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-secondary">
          {initialDoctors.length === 0
            ? "No doctors yet."
            : `${initialDoctors.length} doctor${initialDoctors.length === 1 ? "" : "s"}.`}
        </p>
        {canWrite && mode.view === "list" && (
          <Button onClick={() => setMode({ view: "form", editing: null })}>
            <Plus aria-hidden="true" />
            Add doctor
          </Button>
        )}
      </div>

      {mode.view === "form" && (
        <DoctorForm
          action={mode.editing ? updateDoctorAction : createDoctorAction}
          doctor={mode.editing ?? undefined}
          clinicId={clinicId}
          slotTemplates={
            mode.editing
              ? initialSlotTemplates.filter(
                  (template) => template.doctor_id === mode.editing?.id,
                )
              : []
          }
          vitalsConfig={
            mode.editing
              ? initialVitalsConfigs.find(
                  (config) => config.doctor_id === mode.editing?.id,
                ) ?? null
              : null
          }
          onDone={() => setMode({ view: "list" })}
        />
      )}

      {mode.view !== "form" &&
        (initialDoctors.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="Add your first doctor"
            description="Doctors have their own weekly hours, services and blocked times. Patients can choose who they see when you add more than one."
            actionLabel={canWrite ? "Add doctor" : undefined}
            onAction={canWrite ? () => setMode({ view: "form", editing: null }) : undefined}
          />
        ) : (
          <ul className="space-y-3">
            {initialDoctors.map((doctor) => (
              <li key={doctor.id}>
                <DoctorRow
                  doctor={doctor}
                  canWrite={canWrite}
                  onEdit={() => setMode({ view: "form", editing: doctor })}
                />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function DoctorRow({
  doctor,
  canWrite,
  onEdit,
}: {
  doctor: Doctor;
  canWrite: boolean;
  onEdit: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {doctor.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doctor.photo_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Stethoscope aria-hidden="true" className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-text-primary">{doctor.name}</p>
              <Badge variant={doctor.is_visible ? "success" : "outline"}>
                {doctor.is_visible ? "Bookable" : "Hidden"}
              </Badge>
            </div>
            {doctor.specialty && (
              <p className="mt-0.5 text-sm text-text-secondary">{doctor.specialty}</p>
            )}
            {doctor.credentials && doctor.credentials.length > 0 && (
              <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">
                {doctor.credentials.join(" · ")}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {doctor.consultation_fee !== null && (
            <p className="text-sm font-medium text-text-primary">
              {formatPrice(doctor.consultation_fee)}
            </p>
          )}
          {canWrite && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
              <DoctorVisibilityButton
                doctorId={doctor.id}
                isVisible={doctor.is_visible}
              />
              <DeleteDoctorButton doctorId={doctor.id} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DeleteDoctorButton({ doctorId }: { doctorId: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    deleteDoctorAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="doctorId" value={doctorId} />
        <SubmitButton loadingText="Removing…" variant="ghost">
          Remove
        </SubmitButton>
      </form>
      {state && !state.ok && (
        <Alert variant="destructive" className="max-w-xs py-2">
          <AlertCircle aria-hidden="true" />
          <AlertDescription className="text-xs">{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function formatPrice(price: number): string {
  return formatCurrency(price);
}
