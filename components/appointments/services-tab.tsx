"use client";

import { Clock, DollarSign, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Service } from "@/types/database";

const CATEGORY_LABELS: Record<string, string> = {
  consultation: "Consultation",
  service: "Diagnostic / Service",
  procedure: "Procedure",
  followup: "Follow-up",
};

/**
 * Services tab content — shows a grid of service cards with price, duration,
 * and a "Book Service" action button. Follows Doxmate clinical card patterns.
 */
export function ServicesTab({
  services,
  onBookService,
}: {
  services: Service[];
  onBookService: (serviceId: string) => void;
}) {
  const activeServices = services.filter((s) => s.status === "active");

  if (activeServices.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-text-muted">No services configured.</p>
          <p className="mt-1 text-xs text-text-muted">
            Add services from the Services Settings page.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group by category
  const grouped = activeServices.reduce<Record<string, Service[]>>((acc, svc) => {
    const cat = svc.category ?? "service";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(svc);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, svcs]) => (
        <div key={category}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            {CATEGORY_LABELS[category] ?? category}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {svcs.map((svc) => (
              <Card
                key={svc.id}
                className="transition-colors hover:border-primary/30"
              >
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {svc.name}
                    </p>
                    {svc.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">
                        {svc.description}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-text-secondary">
                      {svc.duration_minutes > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {svc.duration_minutes} min
                        </span>
                      )}
                      {svc.price > 0 && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" aria-hidden="true" />
                          {svc.price.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {svc.doctor_id && (
                      <p className="mt-1 text-[10px] text-text-muted">
                        Assigned doctor
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1"
                    onClick={() => onBookService(svc.id)}
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    Book
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
