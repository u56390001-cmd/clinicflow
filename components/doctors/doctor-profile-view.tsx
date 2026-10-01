"use client";

import {
  Briefcase,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  HeartPulse,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Star,
  TrendingUp,
  User,
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
import type {
  Doctor,
  DoctorSlotTemplate,
  DoctorVitalsConfig,
  PreConsultationQuestion,
} from "@/types/database";

const emptyDays = Array.from({ length: 7 }, () => false);

/** Standard vitals keys -> human labels (mirrors the profile editor). */
const STANDARD_VITAL_LABELS: Record<string, string> = {
  height: "Height",
  weight: "Weight",
  bmi: "BMI",
  blood_pressure: "Blood Pressure",
  pulse: "Pulse",
  temperature: "Temperature",
  spo2: "SpO₂",
  respiratory_rate: "Respiratory Rate",
  blood_sugar: "Blood Sugar",
};

/**
 * Read-only Doctor profile shown from the "View Profile" button. Renders the
 * brand hero via `DetailModalHero`, then a stat grid and a 2-column body:
 * professional/contact info, clinic location, about, performance, vitals and
 * pre-consultation questions on the left; weekly availability (day badges +
 * real slot templates) on the right.
 */
export function DoctorProfileView({
  doctor,
  slots,
  patientCount,
  consultationCount,
  onClose,
  onEdit,
  clinicName,
  clinicAddress,
  vitalsConfig,
  preConsultQuestions,
}: {
  doctor: Doctor;
  slots: DoctorSlotTemplate[];
  patientCount: number;
  consultationCount: number;
  onClose: () => void;
  /** When provided, renders the "Edit Profile" action (writable users only). */
  onEdit?: () => void;
  clinicName?: string | null;
  clinicAddress?: string | null;
  vitalsConfig?: DoctorVitalsConfig | null;
  preConsultQuestions?: PreConsultationQuestion[];
}) {
  const workingDays = emptyDays.slice();
  for (const slot of slots) workingDays[slot.day_of_week] = true;

  const daysWithSlots = WEEKDAY_ORDER.map((day, index) => ({
    day,
    slots: slots.filter((slot) => slot.day_of_week === index),
  })).filter((entry) => entry.slots.length > 0);

  const experience =
    doctor.years_of_experience !== null
      ? `${doctor.years_of_experience} yrs`
      : "—";

  // Weekly hours = sum of all slot template durations across the week.
  const weeklyMinutes = slots.reduce((total, slot) => {
    const [sh, sm] = slot.start_time.split(":").map(Number);
    const [eh, em] = slot.end_time.split(":").map(Number);
    return total + Math.max(0, eh * 60 + em - (sh * 60 + sm));
  }, 0);
  const weeklyHours = `${Math.round((weeklyMinutes / 60) * 10) / 10}h`;

  const standardVitals = vitalsConfig?.standard_vitals ?? null;
  const standardVitalLabels =
    standardVitals === null ? null : standardVitals.map((key) => STANDARD_VITAL_LABELS[key] ?? key);
  const customVitalLabels = vitalsConfig?.custom_vitals?.length
    ? vitalsConfig.custom_vitals.map((vital) => vital.label)
    : [];
  const hasVitals =
    vitalsConfig !== undefined &&
    vitalsConfig !== null &&
    ((standardVitalLabels !== null && standardVitalLabels.length > 0) ||
      customVitalLabels.length > 0);

  return (
    <DetailModalLayout
      icon={User}
      title="Doctor Profile"
      subtitle=""
      onClose={onClose}
      header={
        <DetailModalHero onClose={onClose}>
          <div className="relative shrink-0">
            {doctor.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={doctor.photo_url}
                alt=""
                className="h-16 w-16 rounded-2xl border-4 border-white/30 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white/30 bg-white/20 text-2xl font-bold">
                {doctor.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white bg-status-success" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-bold">{doctor.name}</h2>
            <p className="mt-0.5 text-sm text-white/80">
              {doctor.specialty ?? "Doctor"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-sm font-medium">
                <Star
                  className="h-4 w-4 fill-current text-yellow-400"
                  aria-hidden="true"
                />
                0 rating
              </span>
              <Badge className="border-white/30 bg-white/15 text-white">
                {doctor.is_visible ? "Active" : "Hidden"}
              </Badge>
              <Badge className="border-violet-300/40 bg-violet-400/20 text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-100" />
                {consultationTypeLabel(doctor.consultation_type)}
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
            Profile last updated {formatDate(doctor.updated_at)}
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
              <Button
                type="button"
                onClick={onEdit}
                className="rounded-full"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit Profile
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
            value={patientCount}
            label="Total Patients"
            tone="primary"
          />
          <MetricCard
            icon={CalendarCheck}
            value={consultationCount}
            label="Consultations"
            tone="info"
          />
          <MetricCard
            icon={Briefcase}
            value={experience}
            label="Experience"
            tone="success"
          />
          <MetricCard
            icon={Wallet}
            value={
              doctor.consultation_fee !== null
                ? formatCurrency(doctor.consultation_fee)
                : "—"
            }
            label="Fee Per Session"
            tone="warning"
          />
        </div>

        {/* Main content — 2 column */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          {/* Left column */}
          <div className="space-y-6">
            <SectionCard title="Professional Information" icon={User} tone="primary">
              <Field label="Qualification" value={doctor.qualification} />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Specialty" value={doctor.specialty} />
                <Field label="Experience" value={experience} />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Joined On" value={formatDate(doctor.created_at)} />
                <Field
                  label="Consultation Mode"
                  value={consultationModeLabel(doctor.consultation_mode)}
                />
              </div>
              <FollowUpBox doctor={doctor} className="mt-4" />
            </SectionCard>

            <SectionCard title="Contact & Registration" icon={Phone} tone="success">
              <div className="space-y-3">
                <ContactRow icon={Phone} value={doctor.phone} note="Primary contact" />
                <ContactRow icon={Mail} value={doctor.email} note="Email address" />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Registration No."
                  value={doctor.medical_registration_number}
                />
                <Field
                  label="Max Patients / Window"
                  value={doctor.max_patients_per_window}
                />
              </div>
            </SectionCard>

            <SectionCard title="Clinic Location" icon={MapPin} tone="violet">
              <div className="rounded-xl border border-violet-200 bg-white p-4">
                <p className="text-sm text-text-muted">This doctor works at:</p>
                <p className="mt-0.5 font-medium text-text-primary">
                  {clinicName ?? "Your clinic"}
                </p>
                {clinicAddress ? (
                  <p className="mt-1 text-sm text-text-secondary">{clinicAddress}</p>
                ) : (
                  <p className="mt-2 text-xs text-text-muted">
                    Address details are managed at Organization level
                  </p>
                )}
              </div>
            </SectionCard>

            <SectionCard title="About this Doctor" icon={FileText} tone="slate">
              <div className="rounded-xl border border-neutral-borderLight bg-white p-4">
                {doctor.professional_description ? (
                  <p className="leading-relaxed text-text-primary">
                    {doctor.professional_description}
                  </p>
                ) : (
                  <p className="text-sm text-text-muted">
                    No additional information provided.
                  </p>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Performance Metrics" icon={TrendingUp} tone="amber">
              <div className="grid gap-4 sm:grid-cols-2">
                <MiniStat icon={Clock} label="Weekly Hours" value={weeklyHours} />
                <MiniStat icon={Star} label="Average Rating" value="0" />
              </div>
            </SectionCard>

            <SectionCard title="Vitals Configuration" icon={HeartPulse} tone="teal">
              {hasVitals ? (
                <div className="space-y-3">
                  {standardVitals === null && (
                    <p className="rounded-xl border border-primary/15 bg-white px-4 py-3 text-sm text-text-secondary">
                      Captures all standard vitals:
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(standardVitalLabels ?? []).map((label) => (
                      <VitalPill key={label} label={label} />
                    ))}
                    {customVitalLabels.map((label) => (
                      <VitalPill key={label} label={label} custom />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-neutral-borderLight bg-white p-6 text-center">
                  <HeartPulse className="mx-auto mb-2 h-8 w-8 text-text-muted/40" aria-hidden="true" />
                  <p className="text-sm text-text-muted">No vitals configured</p>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Pre-Consultation Questions" icon={FileText} tone="violet">
              {preConsultQuestions && preConsultQuestions.length > 0 ? (
                <ol className="space-y-2">
                  {preConsultQuestions.map((question, index) => (
                    <li
                      key={question.id}
                      className="flex items-start gap-3 rounded-xl border border-violet-200 bg-white px-4 py-3"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-semibold text-violet-600">
                        {index + 1}
                      </span>
                      <p className="text-sm font-medium text-text-primary">
                        {question.question_text}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="rounded-xl border border-neutral-borderLight bg-white p-6 text-center">
                  <FileText className="mx-auto mb-2 h-8 w-8 text-text-muted/40" aria-hidden="true" />
                  <p className="text-sm text-text-muted">
                    Pre-consultation questions are disabled
                  </p>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <SectionCard title="Weekly Availability" icon={CalendarDays} tone="indigo">
              <AvailabilityDayBadges workingDays={workingDays} />

              {daysWithSlots.length === 0 ? (
                <div className="mt-5 rounded-xl border border-indigo-200 bg-white p-6 text-center">
                  <CalendarDays className="mx-auto mb-2 h-8 w-8 text-text-muted/40" aria-hidden="true" />
                  <p className="text-sm text-text-muted">
                    No slots set up for this doctor yet. Open the profile editor
                    to create weekly slots.
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {daysWithSlots.map(({ day, slots: daySlots }) => (
                    <div
                      key={day}
                      className="rounded-xl border border-indigo-200 bg-white p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <h5 className="font-semibold text-text-primary">{day}</h5>
                        <span className="rounded-full bg-status-success/10 px-2 py-0.5 text-xs font-medium text-status-success">
                          {daySlots.length} slot{daySlots.length > 1 ? "s" : ""}
                        </span>
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
                              ) : null}
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

function ContactRow({
  icon: Icon,
  value,
  note,
}: {
  icon: LucideIcon;
  value?: string | null;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate font-medium text-text-primary">{value ?? "—"}</p>
        {note && <p className="text-sm text-text-muted">{note}</p>}
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-status-warning/15 bg-white p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" />
        <span className="text-sm font-medium text-text-muted">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-text-primary">{value}</p>
    </div>
  );
}

function VitalPill({ label, custom = false }: { label: string; custom?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium",
        custom
          ? "border-primary/30 bg-primary/5 text-primary"
          : "border-neutral-borderLight bg-app text-text-secondary",
      )}
    >
      {label}
    </span>
  );
}

function FollowUpBox({ doctor, className }: { doctor: Doctor; className?: string }) {
  const hasFollowUp = doctor.follow_up_fee !== null;
  return (
    <div
      className={cn(
        "rounded-xl border border-primary/15 bg-primary/5 p-4",
        className,
      )}
    >
      <p className="text-sm font-medium text-text-muted">Follow-up Fee</p>
      {hasFollowUp ? (
        <>
          <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
            <span className="text-lg font-bold text-primary">
              {formatCurrency(doctor.follow_up_fee)}
            </span>
            {doctor.follow_up_valid_for !== null &&
              doctor.follow_up_period !== null && (
                <>
                  <span className="text-sm text-text-muted">valid within</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {doctor.follow_up_valid_for}{" "}
                    {periodLabel(doctor.follow_up_period)}
                  </span>
                </>
              )}
          </div>
          {doctor.follow_up_valid_for !== null &&
            doctor.follow_up_period !== null &&
            doctor.consultation_fee !== null &&
            doctor.follow_up_fee !== doctor.consultation_fee && (
              <p className="mt-1 text-xs text-primary">
                Follow-up visits within {doctor.follow_up_valid_for}{" "}
                {periodLabel(doctor.follow_up_period)} charged{" "}
                {formatCurrency(doctor.follow_up_fee)} instead of{" "}
                {formatCurrency(doctor.consultation_fee)}
              </p>
            )}
        </>
      ) : (
        <p className="mt-1 text-text-muted">—</p>
      )}
    </div>
  );
}

function consultationTypeLabel(type: Doctor["consultation_type"]): string {
  switch (type) {
    case "both":
      return "Offline & Online";
    case "online":
      return "Online";
    case "offline":
      return "Offline";
  }
}

function consultationModeLabel(mode: Doctor["consultation_mode"]): string {
  return mode === "single_slot" ? "Single slot" : "Shared window";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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