"use client";

import { useState } from "react";
import { Plus, Stethoscope } from "lucide-react";

import { ServiceForm } from "@/components/services/service-form";
import { ServiceStatusButton } from "@/components/services/service-status-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createServiceAction,
  updateServiceAction,
} from "@/lib/actions/services";
import { formatCurrency } from "@/lib/utils/currency";
import type { Doctor, Service } from "@/types/database";

type Mode =
  | { view: "list" }
  | { view: "form"; editing: Service | null };

export function ServicesManager({
  initialServices,
  doctors,
  canWrite,
}: {
  initialServices: Service[];
  /** Visible bookable doctors offered in the service form's doctor select. */
  doctors: Pick<Doctor, "id" | "name">[];
  canWrite: boolean;
}) {
  const [mode, setMode] = useState<Mode>({ view: "list" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-secondary">
          {initialServices.length === 0
            ? "No services yet."
            : `${initialServices.length} service${initialServices.length === 1 ? "" : "s"}.`}
        </p>
        {canWrite && mode.view === "list" && (
          <Button onClick={() => setMode({ view: "form", editing: null })}>
            <Plus aria-hidden="true" />
            Add service
          </Button>
        )}
      </div>

      {mode.view === "form" ? (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-4 text-lg font-medium text-secondary">
              {mode.editing ? "Edit service" : "Add a service"}
            </h2>
            <ServiceForm
              action={mode.editing ? updateServiceAction : createServiceAction}
              service={mode.editing ?? undefined}
              doctors={doctors}
              onDone={() => setMode({ view: "list" })}
            />
          </CardContent>
        </Card>
      ) : initialServices.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="Add your first service"
          description="Services are what patients book — like consultations, check-ups or procedures. Each has a duration and price."
          actionLabel={canWrite ? "Add service" : undefined}
          onAction={canWrite ? () => setMode({ view: "form", editing: null }) : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {initialServices.map((service) => (
            <li key={service.id}>
              <ServiceRow
                service={service}
                doctors={doctors}
                canWrite={canWrite}
                onEdit={() => setMode({ view: "form", editing: service })}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ServiceRow({
  service,
  doctors,
  canWrite,
  onEdit,
}: {
  service: Service;
  doctors: Pick<Doctor, "id" | "name">[];
  canWrite: boolean;
  onEdit: () => void;
}) {
  const active = service.status === "active";
  const doctorName = doctors.find((d) => d.id === service.doctor_id)?.name;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-text-primary">{service.name}</p>
            <Badge variant={active ? "success" : "outline"}>
              {active ? "Active" : "Inactive"}
            </Badge>
          </div>
          {doctorName && (
            <p className="mt-1 text-sm text-text-secondary">with {doctorName}</p>
          )}
          {service.description && (
            <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
              {service.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-text-primary">
              {formatDuration(service.duration_minutes)}
            </p>
            <p className="text-sm text-text-secondary">
              {formatPrice(service.price)}
            </p>
          </div>
          {canWrite && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
              <ServiceStatusButton
                serviceId={service.id}
                status={service.status}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

function formatPrice(price: number): string {
  return formatCurrency(price);
}
