"use client";

import {
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  FlaskConical,
  Pencil,
  Receipt,
  Star,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AvailabilityDayBadges } from "@/components/availability/availability-day-badges";
import { DetailModalHero } from "@/components/ui/detail-modal-hero";
import { DetailModalLayout } from "@/components/ui/detail-modal-layout";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionCard } from "@/components/ui/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WEEKDAY_ORDER } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { Service, ServiceSlotTemplate } from "@/types/database";

const emptyDays = Array.from({ length: 7 }, () => false);

/**
 * Read-only service detail shown from the "View Detail" button. Renders the
 * brand hero via `DetailModalHero`, then a stat grid and a 2-column body:
 * service details / description / preparation on the left; weekly availability
 * (day badges + real slot templates + next available slot) on the right.
 */
export function ServiceDetailView({
  service,
  slots,
  practitionerName,
  bookingCount,
  completedCount,
  monthlyRevenue,
  durationText,
  onClose,
  onEdit,
}: {
  service: Service;
  slots: ServiceSlotTemplate[];
  practitionerName: string | null;
  bookingCount: number;
  completedCount: number;
  monthlyRevenue: number;
  /** Pre-formatted duration / report-time label (e.g. "45 mins"). */
  durationText: string;
  onClose: () => void;
  /** When provided, renders the "Edit Service" action (writable users only). */
  onEdit?: () => void;
}) {
  const workingDays = emptyDays.slice();
  for (const slot of slots) workingDays[slot.day_of_week] = true;

  const daysWithSlots = WEEKDAY_ORDER.map((day, index) => ({
    day,
    slots: slots.filter((slot) => slot.day_of_week === index),
  })).filter((entry) => entry.slots.length > 0);

  const nextAvailable = nextAvailableSlot(slots);
  const hasFollowUp = service.follow_up_fee !== null;

  return (
    <DetailModalLayout
      icon={FlaskConical}
      title="Service Details"
      subtitle=""
      onClose={onClose}
      header={
        <DetailModalHero onClose={onClose}>
          <div className="relative shrink-0">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white/30 bg-white/20">
              <FlaskConical className="h-7 w-7 text-white" aria-hidden="true" />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-status-success">
              <CheckCircle2 className="h-3 w-3 text-white" aria-hidden="true" />
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-bold">{service.name}</h2>
            <p className="mt-0.5 text-sm text-white/80">
              {categoryLabel(service.category)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className="border-white/30 bg-white/15 text-white">
                {service.status === "active" ? "Active" : "Inactive"}
              </Badge>
              <Badge className="border-violet-300/40 bg-violet-400/20 text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-100" />
                {service.consultation_mode === "single_slot"
                  ? "Single Slot"
                  : "Shared Window"}
              </Badge>
            </div>
          </div>
        </DetailModalHero>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <CheckCircle2
              className="h-3.5 w-3.5 text-status-success"
              aria-hidden="true"
            />
            Profile last updated {formatDate(service.updated_at)}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-full"
            >
              Cancel
            </Button>
            {onEdit && (
              <Button type="button" onClick={onEdit} className="rounded-full">
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit Service
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* Body */}
      <div className="space-y-8 p-6 md:p-8">
        {/* Top stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            icon={Users}
            value={bookingCount}
            label="Total Bookings"
            tone="primary"
          />
          <MetricCard
            icon={CheckCircle2}
            value={completedCount}
            label="Completed"
            tone="success"
          />
          <MetricCard
            icon={Wallet}
            value={formatCurrency(monthlyRevenue)}
            label="This Month's Revenue"
            tone="info"
          />
          <MetricCard
            icon={Receipt}
            value={formatCurrency(service.price)}
            label="Fee"
            tone="warning"
          />
        </div>

        {/* Main content — 2 column */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          {/* Left column */}
          <div className="space-y-6">
            <SectionCard title="Service Details" icon={Receipt} tone="primary">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category" value={categoryLabel(service.category)} />
                <Field label="Performed By" value={practitionerName ?? "Standalone"} />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Price" value={formatCurrency(service.price)} />
                <Field label="Duration" value={durationText} />
              </div>

              <div
                className={cn(
                  "mt-4 rounded-xl border p-4",
                  hasFollowUp
                    ? "border-primary/15 bg-primary/5"
                    : "border-neutral-borderLight bg-app/50",
                )}
              >
                <p className="text-sm font-medium text-text-muted">
                  Follow-up Fee
                </p>
                {hasFollowUp ? (
                  <>
                    <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                      <span className="text-lg font-bold text-primary">
                        {formatCurrency(service.follow_up_fee)}
                      </span>
                      {service.follow_up_valid_for !== null &&
                        service.follow_up_period !== null && (
                          <>
                            <span className="text-sm text-text-muted">
                              valid within
                            </span>
                            <span className="text-sm font-semibold text-text-primary">
                              {service.follow_up_valid_for}{" "}
                              {periodLabel(service.follow_up_period)}
                            </span>
                          </>
                        )}
                    </div>
                    {service.follow_up_valid_for !== null &&
                      service.follow_up_period !== null &&
                      service.follow_up_fee !== service.price && (
                        <p className="mt-1 text-xs text-primary">
                          Follow-up visits within {service.follow_up_valid_for}{" "}
                          {periodLabel(service.follow_up_period)} charged{" "}
                          {formatCurrency(service.follow_up_fee)} instead of{" "}
                          {formatCurrency(service.price)}
                        </p>
                      )}
                  </>
                ) : (
                  <p className="mt-1 text-text-muted">—</p>
                )}
              </div>
            </SectionCard>

            <SectionCard title="About This Service" icon={FileText} tone="slate">
              <div className="rounded-xl border border-neutral-borderLight bg-white p-4">
                {service.description ? (
                  <p className="leading-relaxed text-text-primary">
                    {service.description}
                  </p>
                ) : (
                  <p className="text-sm text-text-muted">
                    No description provided.
                  </p>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Preparation Instructions"
              icon={FileText}
              tone="amber"
            >
              <div className="rounded-xl border border-status-warning/15 bg-white p-4">
                {service.preparation_instructions ? (
                  <p className="leading-relaxed text-text-primary">
                    {service.preparation_instructions}
                  </p>
                ) : (
                  <p className="text-sm text-text-muted">
                    No preparation instructions provided.
                  </p>
                )}
              </div>
            </SectionCard>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <SectionCard title="Weekly Availability" icon={CalendarDays} tone="indigo">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <AvailabilityDayBadges workingDays={workingDays} />
                {nextAvailable && (
                  <Badge className="bg-primary/10 text-primary">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    Next Available {nextAvailable}
                  </Badge>
                )}
              </div>

              {daysWithSlots.length === 0 ? (
                <div className="mt-5 rounded-xl border border-indigo-200 bg-white p-6 text-center">
                  <CalendarDays className="mx-auto mb-2 h-8 w-8 text-text-muted/40" aria-hidden="true" />
                  <p className="text-sm text-text-muted">
                    No slots set up for this service yet. Open the service
                    editor to create weekly slots.
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {daysWithSlots.map(({ day, slots: daySlots }) => (
                    <div
                      key={day}
                      className="rounded-xl border border-indigo-200 bg-white p-4"
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h5 className="font-semibold text-text-primary">{day}</h5>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-xs text-text-secondary">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            {dayWindow(daySlots)}
                          </span>
                          <span className="rounded-full bg-status-success/10 px-2 py-0.5 text-xs font-medium text-status-success">
                            {daySlots.length} slot{daySlots.length > 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {daySlots.map((slot) => (
                          <div
                            key={slot.id}
                            className="flex items-center justify-between gap-2 rounded-lg bg-indigo-50/70 p-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-text-primary">
                                {slot.slot_name}
                              </p>
                              <p className="text-xs text-text-secondary">
                                {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                              </p>
                              {slot.patient_limit !== null &&
                              slot.patient_limit > 1 ? (
                                <p className="mt-0.5 text-xs text-text-muted">
                                  Up to {slot.patient_limit} patients
                                </p>
                              ) : (
                                <p className="mt-0.5 text-xs text-text-muted">
                                  Limit 1
                                </p>
                              )}
                            </div>
                            <span className="h-2 w-2 shrink-0 rounded-full bg-status-success" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Service Analytics"
              icon={UserCog}
              tone="success"
            >
              <div className="space-y-2">
                <AnalyticsRow
                  icon={Users}
                  label="Total bookings"
                  value={bookingCount}
                />
                <AnalyticsRow
                  icon={CheckCircle2}
                  label="Completed"
                  value={completedCount}
                />
                <AnalyticsRow
                  icon={Star}
                  label="Average rating"
                  value="0"
                />
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </DetailModalLayout>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode | null;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-text-muted">{label}</p>
      <p className="mt-0.5 font-medium text-text-primary">{value ?? "—"}</p>
    </div>
  );
}

function AnalyticsRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-status-success/15 bg-white px-4 py-2.5">
      <span className="flex items-center gap-2 text-sm text-text-secondary">
        <Icon className="h-4 w-4 text-status-success" aria-hidden="true" />
        {label}
      </span>
      <span className="text-sm font-semibold text-text-primary">{value}</span>
    </div>
  );
}

function categoryLabel(category: Service["category"]): string {
  switch (category) {
    case "consultation":
      return "Consultation";
    case "service":
      return "Service";
    case "diagnostic":
      return "Diagnostic";
    case "lab_test":
      return "Lab Test";
    case "procedure":
      return "Procedure";
  }
}

function dayWindow(daySlots: ServiceSlotTemplate[]): string {
  const start = daySlots.reduce((min, s) =>
    s.start_time < min.start_time ? s : min,
  ).start_time.slice(0, 5);
  const end = daySlots.reduce((max, s) =>
    s.end_time > max.end_time ? s : max,
  ).end_time.slice(0, 5);
  return `${start}–${end}`;
}

/** Earliest upcoming slot, from the next day forward (Mon = 0). */
function nextAvailableSlot(slots: ServiceSlotTemplate[]): string | null {
  if (slots.length === 0) return null;
  const todayIndex = (new Date().getDay() + 6) % 7;
  for (let offset = 1; offset <= 7; offset++) {
    const dayIndex = (todayIndex + offset) % 7;
    const daySlots = slots.filter((slot) => slot.day_of_week === dayIndex);
    if (daySlots.length > 0) {
      const earliest = daySlots.reduce((min, s) =>
        s.start_time < min.start_time ? s : min,
      );
      return `${WEEKDAY_ORDER[dayIndex]} ${earliest.start_time.slice(0, 5)}`;
    }
  }
  return null;
}

function periodLabel(period: "days" | "weeks" | "months"): string {
  switch (period) {
    case "days":
      return "Days";
    case "weeks":
      return "Weeks";
    case "months":
      return "Months";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}