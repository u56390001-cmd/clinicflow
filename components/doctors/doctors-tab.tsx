"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  Clock,
  Eye,
  Filter,
  LayoutGrid,
  List,
  Pencil,
  Search,
  Star,
  Stethoscope,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { DoctorForm } from "@/components/doctors/doctor-form";
import { DoctorProfileView } from "@/components/doctors/doctor-profile-view";
import { ServiceDetailView } from "@/components/services/service-detail-view";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import {
  createDoctorAction,
  deleteDoctorAction,
  setDoctorVisibilityAction,
  updateDoctorAction,
} from "@/lib/actions/doctors";
import {
  createServiceAction,
  deleteServiceAction,
  setServiceStatusAction,
  updateServiceAction,
} from "@/lib/actions/services";
import { ServiceForm } from "@/components/services/service-form";
import { WEEKDAY_ORDER } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";
import type {
  Doctor,
  DoctorSlotTemplate,
  DoctorVitalsConfig,
  PreConsultationQuestion,
  Service,
  ServiceSlotTemplate,
} from "@/types/database";

const SEARCH_DEBOUNCE_MS = 350;

type Tab = "doctors" | "services";
type DoctorMode = { view: "list" } | { view: "form"; editing: Doctor | null };
type ServiceMode = { view: "list" } | { view: "form"; editing: Service | null };

const SERVICE_CATEGORIES = [
  "consultation",
  "service",
  "diagnostic",
  "lab_test",
  "procedure",
] as const;

/** Experience bucketed from real `years_of_experience` values (Phase 22). */
const EXPERIENCE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "0-5", label: "0–5 years" },
  { value: "6-10", label: "6–10 years" },
  { value: "11+", label: "11+ years" },
];

/**
 * Rating filter (Phase 22). There is no real rating source yet (Phase 21 keeps
 * ratings at 0/placeholder) — the filter renders honestly but stays inert so we
 * never fabricate ratings. It flips back to filtering once a real source exists.
 */
const RATING_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "4.5+", label: "4.5 & up" },
  { value: "4.0+", label: "4.0 & up" },
  { value: "3.0+", label: "3.0 & up" },
];

/**
 * The Doctors tab (Phase 21): Doctors|Services segmented toggle on top, each
 * with real debounced search + filters. Doctors render as teal cards (grid)
 * or a shared-data table (list); the Services view hosts the upgraded
 * Add/Edit Service modal. Working-day pills and patient counts are real-query
 * values computed by the server page.
 */
export function DoctorsTab({
  initialDoctors,
  initialSlotTemplates,
  initialVitalsConfigs,
  initialServices,
  initialServiceSlotTemplates,
  initialPreConsultQuestions,
  doctorWorkingDays,
  patientCounts,
  doctorConsultationCounts,
  serviceBookings,
  serviceCompletedCounts,
  serviceMonthlyRevenue,
  clinicName,
  clinicAddress,
  clinicId,
  canWrite,
}: {
  initialDoctors: Doctor[];
  initialSlotTemplates: DoctorSlotTemplate[];
  initialVitalsConfigs: DoctorVitalsConfig[];
  initialServices: Service[];
  initialServiceSlotTemplates: ServiceSlotTemplate[];
  /** All clinic pre-consultation questions (Phase 22), scoped per form. */
  initialPreConsultQuestions: PreConsultationQuestion[];
  /** doctorId -> working booleans over WEEKDAY_ORDER (0=Monday). */
  doctorWorkingDays: Record<string, boolean[]>;
  /** doctorId -> distinct patients seen (Realtime-safe real count). */
  patientCounts: Record<string, number>;
  /** doctorId -> total consultations (all appointments incl. repeat visits). */
  doctorConsultationCounts: Record<string, number>;
  /** serviceId -> appointments booked against that service. */
  serviceBookings: Record<string, number>;
  /** serviceId -> completed appointments (revenue-realized). */
  serviceCompletedCounts: Record<string, number>;
  /** serviceId -> revenue from completed appointments this month. */
  serviceMonthlyRevenue: Record<string, number>;
  clinicName?: string | null;
  clinicAddress?: string | null;
  clinicId: string;
  canWrite: boolean;
}) {
  const [tab, setTab] = useState<Tab>("doctors");
  const [doctorMode, setDoctorMode] = useState<DoctorMode>({ view: "list" });
  const [serviceMode, setServiceMode] = useState<ServiceMode>({ view: "list" });
  const [doctorDetail, setDoctorDetail] = useState<Doctor | null>(null);
  const [serviceDetail, setServiceDetail] = useState<Service | null>(null);

  const [doctorQuery, setDoctorQuery] = useState("");
  const [doctorQueryDebounced, setDoctorQueryDebounced] = useState("");
  const [doctorSpecialty, setDoctorSpecialty] = useState("all");
  const [doctorStatus, setDoctorStatus] = useState<"all" | "active" | "hidden">(
    "all",
  );
  const [doctorExperience, setDoctorExperience] = useState("all");
  const [doctorRating, setDoctorRating] = useState("all");
  const [doctorsView, setDoctorsView] = useState<"grid" | "list">("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const doctorFiltersRef = useRef<HTMLDivElement>(null);

  const [serviceQuery, setServiceQuery] = useState("");
  const [serviceQueryDebounced, setServiceQueryDebounced] = useState("");
  const [serviceCategory, setServiceCategory] = useState("all");
  const [serviceStatus, setServiceStatus] = useState<"all" | "active" | "inactive">(
    "all",
  );
  const [serviceFiltersOpen, setServiceFiltersOpen] = useState(false);
  const [servicesView, setServicesView] = useState<"grid" | "list">("grid");
  const serviceFiltersRef = useRef<HTMLDivElement>(null);

  // Close each Filters dropdown on outside click / Escape (matches the
  // Appointments filters pattern).
  useEffect(() => {
    if (!filtersOpen) return;
    function handleClick(event: MouseEvent) {
      if (doctorFiltersRef.current && !doctorFiltersRef.current.contains(event.target as Node)) {
        setFiltersOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setFiltersOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!serviceFiltersOpen) return;
    function handleClick(event: MouseEvent) {
      if (serviceFiltersRef.current && !serviceFiltersRef.current.contains(event.target as Node)) {
        setServiceFiltersOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setServiceFiltersOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [serviceFiltersOpen]);

  useEffect(() => {
    const timer = setTimeout(
      () => setDoctorQueryDebounced(doctorQuery),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [doctorQuery]);

  useEffect(() => {
    const timer = setTimeout(
      () => setServiceQueryDebounced(serviceQuery),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [serviceQuery]);

  // Real specialty values actually used by this clinic's doctors — NOT the
  // full catalogue. Keeps the filter honest per Phase 22's requirement.
  const specialtyOptions = useMemo(() => {
    const used = new Set<string>();
    for (const doctor of initialDoctors) {
      if (doctor.specialty) used.add(doctor.specialty);
    }
    return [...used].sort((a, b) => a.localeCompare(b));
  }, [initialDoctors]);

  function clearDoctorFilters() {
    setDoctorSpecialty("all");
    setDoctorStatus("all");
    setDoctorExperience("all");
    setDoctorRating("all");
  }

  const activeDoctorFilterCount =
    (doctorSpecialty !== "all" ? 1 : 0) +
    (doctorStatus !== "all" ? 1 : 0) +
    (doctorExperience !== "all" ? 1 : 0) +
    (doctorRating !== "all" ? 1 : 0);

  function clearServiceFilters() {
    setServiceCategory("all");
    setServiceStatus("all");
  }

  const activeServiceFilterCount =
    (serviceCategory !== "all" ? 1 : 0) + (serviceStatus !== "all" ? 1 : 0);

  const filteredDoctors = useMemo(() => {
    const q = doctorQueryDebounced.trim().toLowerCase();
    return initialDoctors.filter((doctor) => {
      if (q) {
        const haystack = [
          doctor.name,
          doctor.specialty,
          doctor.phone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (
        doctorSpecialty !== "all" &&
        (doctor.specialty ?? "").toLowerCase() !== doctorSpecialty.toLowerCase()
      ) {
        return false;
      }
      if (doctorStatus === "active" && !doctor.is_visible) return false;
      if (doctorStatus === "hidden" && doctor.is_visible) return false;
      if (doctorExperience !== "all") {
        const years = doctor.years_of_experience;
        if (years === null) return false;
        const [min, max] = (
          doctorExperience === "0-5"
            ? [0, 5]
            : doctorExperience === "6-10"
              ? [6, 10]
              : [11, Infinity]
        ) as [number, number];
        if (years < min || years > max) return false;
      }
      if (doctorRating !== "all") {
        // No real rating source yet — the filter stays present but inert,
        // matching Phase 21/22 ("don't fabricate ratings").
      }
      return true;
    });
  }, [initialDoctors, doctorQueryDebounced, doctorSpecialty, doctorStatus, doctorExperience, doctorRating]);

  const filteredServices = useMemo(() => {
    const q = serviceQueryDebounced.trim().toLowerCase();
    return initialServices.filter((service) => {
      if (q) {
        const haystack = [
          service.name,
          service.category,
          service.description,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (serviceCategory !== "all" && service.category !== serviceCategory) {
        return false;
      }
      if (serviceStatus === "active" && service.status !== "active") return false;
      if (serviceStatus === "inactive" && service.status !== "inactive") return false;
      return true;
    });
  }, [initialServices, serviceQueryDebounced, serviceCategory, serviceStatus]);

  // Days each service is available, derived from its real slot templates.
  const serviceWorkingDays: Record<string, boolean[]> = useMemo(() => {
    const days: Record<string, boolean[]> = {};
    for (const service of initialServices) {
      days[service.id] = Array.from({ length: 7 }, () => false);
    }
    for (const template of initialServiceSlotTemplates) {
      const day = days[template.service_id];
      if (day) day[template.day_of_week] = true;
    }
    return days;
  }, [initialServices, initialServiceSlotTemplates]);

  return (
    <div className="space-y-4">
      {/* Header row — Doctors/Services toggle, search, filters & actions on one line */}
      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
        {/* Doctors / Services toggle */}
        <div className="inline-flex shrink-0 rounded-full border border-border-light bg-surface p-1">
          <button
            type="button"
            onClick={() => setTab("doctors")}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              tab === "doctors"
                ? "bg-primary text-white"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Doctors
          </button>
          <button
            type="button"
            onClick={() => setTab("services")}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              tab === "services"
                ? "bg-primary text-white"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Services
          </button>
        </div>

        {tab === "doctors" ? (
          <div
            ref={doctorFiltersRef}
            className="relative flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <Input
                value={doctorQuery}
                onChange={(event) => setDoctorQuery(event.target.value)}
                placeholder="Search doctors by name, specialty, or phone…"
                aria-label="Search doctors"
                className="pl-9 pr-8"
              />
              {doctorQuery && (
                <button
                  type="button"
                  onClick={() => setDoctorQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <FilterTrigger
                open={filtersOpen}
                onOpenChange={setFiltersOpen}
                activeCount={activeDoctorFilterCount}
              />

              <div className="inline-flex rounded-full border border-border-light bg-surface p-0.5">
                <button
                  type="button"
                  onClick={() => setDoctorsView("grid")}
                  aria-label="Grid view"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                    doctorsView === "grid"
                      ? "bg-primary text-white"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setDoctorsView("list")}
                  aria-label="List view"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                    doctorsView === "list"
                      ? "bg-primary text-white"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  <List className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {canWrite && (
                <Button onClick={() => setDoctorMode({ view: "form", editing: null })}>
                  <Stethoscope aria-hidden="true" />
                  Add doctor
                </Button>
              )}
            </div>

            {filtersOpen && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1.5">
                <DoctorFiltersPanel
                  specialtyOptions={specialtyOptions}
                  specialty={doctorSpecialty}
                  onSpecialtyChange={setDoctorSpecialty}
                  status={doctorStatus}
                  onStatusChange={(value) =>
                    setDoctorStatus(value as "all" | "active" | "hidden")
                  }
                  experience={doctorExperience}
                  onExperienceChange={setDoctorExperience}
                  rating={doctorRating}
                  onRatingChange={setDoctorRating}
                  onClear={clearDoctorFilters}
                />
              </div>
            )}
          </div>
        ) : (
          <div
            ref={serviceFiltersRef}
            className="relative flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <Input
                value={serviceQuery}
                onChange={(event) => setServiceQuery(event.target.value)}
                placeholder="Search services by name, category, or description…"
                aria-label="Search services"
                className="pl-9 pr-8"
              />
              {serviceQuery && (
                <button
                  type="button"
                  onClick={() => setServiceQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <FilterTrigger
                open={serviceFiltersOpen}
                onOpenChange={setServiceFiltersOpen}
                activeCount={activeServiceFilterCount}
              />

              <div className="inline-flex rounded-full border border-border-light bg-surface p-0.5">
                <button
                  type="button"
                  onClick={() => setServicesView("grid")}
                  aria-label="Grid view"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                    servicesView === "grid"
                      ? "bg-primary text-white"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setServicesView("list")}
                  aria-label="List view"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                    servicesView === "list"
                      ? "bg-primary text-white"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  <List className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {canWrite && (
                <Button onClick={() => setServiceMode({ view: "form", editing: null })}>
                  <Stethoscope aria-hidden="true" />
                  Add service
                </Button>
              )}
            </div>

            {serviceFiltersOpen && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1.5">
                <ServiceFiltersPanel
                  category={serviceCategory}
                  onCategoryChange={setServiceCategory}
                  status={serviceStatus}
                  onStatusChange={(value) =>
                    setServiceStatus(
                      value as "all" | "active" | "inactive",
                    )
                  }
                  onClear={clearServiceFilters}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {tab === "doctors" ? (
        <div className="space-y-4">
          {/* Doctor list */}
          {filteredDoctors.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title={initialDoctors.length === 0 ? "Add your first doctor" : "No doctors found"}
              description={
                initialDoctors.length === 0
                  ? "Doctors have their own weekly hours, services and blocked times. Patients can choose who they see when you add more than one."
                  : "Try a different search or clear the filters."
              }
              actionLabel={
                canWrite && initialDoctors.length === 0 ? "Add doctor" : undefined
              }
              onAction={
                canWrite && initialDoctors.length === 0
                  ? () => setDoctorMode({ view: "form", editing: null })
                  : undefined
              }
            />
          ) : doctorsView === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredDoctors.map((doctor) => (
                <DoctorCard
                  key={doctor.id}
                  doctor={doctor}
                  workingDays={doctorWorkingDays[doctor.id] ?? emptyDays}
                  patientCount={patientCounts[doctor.id] ?? 0}
                  canWrite={canWrite}
                  onView={() => setDoctorDetail(doctor)}
                  onEdit={() => setDoctorMode({ view: "form", editing: doctor })}
                />
              ))}
            </div>
          ) : (
            <DoctorTable
              doctors={filteredDoctors}
              workingDays={doctorWorkingDays}
              canWrite={canWrite}
              onView={(doctor) => setDoctorDetail(doctor)}
              onEdit={(doctor) => setDoctorMode({ view: "form", editing: doctor })}
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Service list */}
          {filteredServices.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title={initialServices.length === 0 ? "Add your first service" : "No services found"}
              description={
                initialServices.length === 0
                  ? "Services are what patients book — like consultations, check-ups or procedures. Each has a duration and price."
                  : "Try a different search or clear the filters."
              }
              actionLabel={
                canWrite && initialServices.length === 0 ? "Add service" : undefined
              }
              onAction={
                canWrite && initialServices.length === 0
                  ? () => setServiceMode({ view: "form", editing: null })
                  : undefined
              }
            />
          ) : servicesView === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredServices.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  workingDays={serviceWorkingDays[service.id] ?? emptyDays}
                  bookingCount={serviceBookings[service.id] ?? 0}
                  canWrite={canWrite}
                  onView={() => setServiceDetail(service)}
                  onEdit={() => setServiceMode({ view: "form", editing: service })}
                />
              ))}
            </div>
          ) : (
            <ServiceTable
              services={filteredServices}
              workingDays={serviceWorkingDays}
              bookingCounts={serviceBookings}
              canWrite={canWrite}
              onView={(service) => setServiceDetail(service)}
              onEdit={(service) => setServiceMode({ view: "form", editing: service })}
            />
          )}
        </div>
      )}

      {/* Modals */}
      {doctorMode.view === "form" && (
        <DoctorForm
          action={doctorMode.editing ? updateDoctorAction : createDoctorAction}
          doctor={doctorMode.editing ?? undefined}
          clinicId={clinicId}
          slotTemplates={
            doctorMode.editing
              ? initialSlotTemplates.filter(
                  (template) => template.doctor_id === doctorMode.editing?.id,
                )
              : []
          }
          vitalsConfig={
            doctorMode.editing
              ? initialVitalsConfigs.find(
                  (config) => config.doctor_id === doctorMode.editing?.id,
                ) ?? null
              : null
          }
          preConsultQuestions={
            doctorMode.editing
              ? initialPreConsultQuestions.filter(
                  (question) => question.doctor_id === doctorMode.editing?.id,
                )
              : []
          }
          onDone={() => setDoctorMode({ view: "list" })}
        />
      )}
      {serviceMode.view === "form" && (
        <ServiceForm
          action={serviceMode.editing ? updateServiceAction : createServiceAction}
          service={serviceMode.editing ?? undefined}
          doctors={initialDoctors}
          slotTemplates={
            serviceMode.editing
              ? initialServiceSlotTemplates.filter(
                  (template) => template.service_id === serviceMode.editing?.id,
                )
              : []
          }
          preConsultQuestions={
            serviceMode.editing
              ? initialPreConsultQuestions.filter(
                  (question) => question.service_id === serviceMode.editing?.id,
                )
              : []
          }
          onDone={() => setServiceMode({ view: "list" })}
        />
      )}
      {doctorDetail && (
        <DoctorProfileView
          doctor={doctorDetail}
          slots={initialSlotTemplates.filter(
            (template) => template.doctor_id === doctorDetail.id,
          )}
          patientCount={patientCounts[doctorDetail.id] ?? 0}
          consultationCount={doctorConsultationCounts[doctorDetail.id] ?? 0}
          clinicName={clinicName}
          clinicAddress={clinicAddress}
          vitalsConfig={
            initialVitalsConfigs.find(
              (config) => config.doctor_id === doctorDetail.id,
            ) ?? null
          }
          preConsultQuestions={initialPreConsultQuestions.filter(
            (question) => question.doctor_id === doctorDetail.id,
          )}
          onClose={() => setDoctorDetail(null)}
          onEdit={
            canWrite
              ? () => {
                  const editing = doctorDetail;
                  setDoctorDetail(null);
                  setDoctorMode({ view: "form", editing });
                }
              : undefined
          }
        />
      )}
      {serviceDetail && (
        <ServiceDetailView
          service={serviceDetail}
          slots={initialServiceSlotTemplates.filter(
            (template) => template.service_id === serviceDetail.id,
          )}
          practitionerName={
            initialDoctors.find((d) => d.id === serviceDetail.doctor_id)?.name ??
            null
          }
          bookingCount={serviceBookings[serviceDetail.id] ?? 0}
          completedCount={serviceCompletedCounts[serviceDetail.id] ?? 0}
          monthlyRevenue={serviceMonthlyRevenue[serviceDetail.id] ?? 0}
          durationText={
            serviceDetail.duration_or_report_time
              ? serviceDetail.duration_or_report_time
              : formatDuration(serviceDetail.duration_minutes)
          }
          onClose={() => setServiceDetail(null)}
          onEdit={
            canWrite
              ? () => {
                  const editing = serviceDetail;
                  setServiceDetail(null);
                  setServiceMode({ view: "form", editing });
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

const emptyDays = Array.from({ length: 7 }, () => false);

function categoryLabel(category: string): string {
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
    default:
      return category;
  }
}

/**
 * Shared "Filters" trigger button for both the Doctors and Services toolbar.
 * Shows an active-filter count badge and rotates the chevron while open.
 */
function FilterTrigger({
  open,
  onOpenChange,
  activeCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCount: number;
}) {
  return (
    <button
      type="button"
      aria-haspopup="true"
      aria-expanded={open}
      onClick={() => onOpenChange(!open)}
      className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
        activeCount > 0
          ? "border-primary/40 bg-primary/5 text-primary"
          : "border-border-medium bg-white text-text-secondary hover:border-primary/40 hover:text-text-primary"
      }`}
    >
      <Filter className="h-4 w-4" aria-hidden="true" />
      <span>Filters</span>
      {activeCount > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-white">
          {activeCount}
        </span>
      )}
      <ChevronDown
        className={`h-4 w-4 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * The Doctors-view Filters panel (Phase 22, matching t26). Four columns in a
 * SINGLE row — Specialty / Status / Experience / Rating — plus "✕ Clear
 * Filters". Specialty + Status + Experience have real filtering effects;
 * Rating is intentionally inert until a real rating source exists. Rendered
 * by the parent inside a full-width `absolute` wrapper so it spans exactly the
 * width of the doctor list container below it.
 */
function DoctorFiltersPanel({
  specialtyOptions,
  specialty,
  onSpecialtyChange,
  status,
  onStatusChange,
  experience,
  onExperienceChange,
  rating,
  onRatingChange,
  onClear,
}: {
  specialtyOptions: string[];
  specialty: string;
  onSpecialtyChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  experience: string;
  onExperienceChange: (value: string) => void;
  rating: string;
  onRatingChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-border-light bg-white p-4 shadow-dropdown">
      <div className="grid grid-cols-4 gap-3">
        <FilterBlock label="Specialty">
          <NativeSelect
            value={specialty}
            onChange={(event) => onSpecialtyChange(event.target.value)}
            aria-label="Filter by specialty"
            className="h-9"
          >
            <option value="all">All Specialties</option>
            {specialtyOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
        </FilterBlock>

        <FilterBlock label="Status">
          <NativeSelect
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
            aria-label="Filter by status"
            className="h-9"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
          </NativeSelect>
        </FilterBlock>

        <FilterBlock label="Experience">
          <NativeSelect
            value={experience}
            onChange={(event) => onExperienceChange(event.target.value)}
            aria-label="Filter by experience"
            className="h-9"
          >
            <option value="all">All Experience</option>
            {EXPERIENCE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </FilterBlock>

        <FilterBlock label="Rating">
          <NativeSelect
            value={rating}
            onChange={(event) => onRatingChange(event.target.value)}
            aria-label="Filter by rating"
            className="h-9"
          >
            <option value="all">All Ratings</option>
            {RATING_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
          <p className="mt-1 text-xs text-text-muted">
            Ratings will filter once live reviews are added.
          </p>
        </FilterBlock>
      </div>

      <div className="mt-3 flex justify-end border-t border-border-light pt-3">
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-light hover:underline"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Clear Filters
        </button>
      </div>
    </div>
  );
}

/**
 * The Services-view Filters panel (Phase 22). A single row with Category /
 * Status columns plus "✕ Clear Filters" — same full-width dropdown treatment
 * as the Doctors panel, aligned with the service list container.
 */
function ServiceFiltersPanel({
  category,
  onCategoryChange,
  status,
  onStatusChange,
  onClear,
}: {
  category: string;
  onCategoryChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-border-light bg-white p-4 shadow-dropdown">
      <div className="grid grid-cols-2 gap-3">
        <FilterBlock label="Category">
          <NativeSelect
            value={category}
            onChange={(event) => onCategoryChange(event.target.value)}
            aria-label="Filter by category"
            className="h-9"
          >
            <option value="all">All Categories</option>
            {SERVICE_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {categoryLabel(option)}
              </option>
            ))}
          </NativeSelect>
        </FilterBlock>

        <FilterBlock label="Status">
          <NativeSelect
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
            aria-label="Filter by status"
            className="h-9"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </NativeSelect>
        </FilterBlock>
      </div>

      <div className="mt-3 flex justify-end border-t border-border-light pt-3">
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-light hover:underline"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Clear Filters
        </button>
      </div>
    </div>
  );
}

function FilterBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function WorkingDayPills({ workingDays }: { workingDays: boolean[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {WEEKDAY_ORDER.map((day, index) => (
        <span
          key={day}
          title={day}
          className={cn(
            "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-medium capitalize",
            workingDays[index]
              ? "bg-status-success text-white"
              : "bg-app text-text-muted",
          )}
        >
          {day.slice(0, 1)}
        </span>
      ))}
    </div>
  );
}

function DoctorCard({
  doctor,
  workingDays,
  patientCount,
  canWrite,
  onView,
  onEdit,
}: {
  doctor: Doctor;
  workingDays: boolean[];
  patientCount: number;
  canWrite: boolean;
  onView: () => void;
  onEdit: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {doctor.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={doctor.photo_url}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                {doctor.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-text-primary">
                {doctor.name}
              </p>
              {doctor.specialty && (
                <p className="text-sm text-primary">{doctor.specialty}</p>
              )}
              {doctor.years_of_experience !== null && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  {doctor.years_of_experience} yrs experience
                </p>
              )}
            </div>
          </div>
          <span
            title={doctor.is_visible ? "Active" : "Hidden"}
            className={cn(
              "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
              doctor.is_visible ? "bg-status-success" : "bg-status-destructive/60",
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-control border border-neutral-borderLight bg-app/50 px-3 py-2">
            <Star className="h-4 w-4 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-text-primary">0.0</p>
              <p className="text-xs text-text-muted">Rating</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-control border border-neutral-borderLight bg-app/50 px-3 py-2">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {patientCount}
              </p>
              <p className="text-xs text-text-muted">Patients</p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-text-muted">Working days</p>
          <WorkingDayPills workingDays={workingDays} />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-neutral-borderLight pt-3">
          <Button variant="outline" size="sm" onClick={onView}>
            <Eye aria-hidden="true" />
            View Profile
          </Button>
          {canWrite && (
            <div className="flex items-center gap-1">
              <IconButton
                label={`Edit ${doctor.name}`}
                onClick={onEdit}
                icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
              />
              <DoctorVisibilitySwitch doctorId={doctor.id} isVisible={doctor.is_visible} />
              <DeleteDoctorButton doctorId={doctor.id} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DoctorTable({
  doctors,
  workingDays,
  canWrite,
  onView,
  onEdit,
}: {
  doctors: Doctor[];
  workingDays: Record<string, boolean[]>;
  canWrite: boolean;
  onView: (doctor: Doctor) => void;
  onEdit: (doctor: Doctor) => void;
}) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-borderLight text-xs font-semibold uppercase tracking-wider text-text-muted">
              <th className="px-4 py-3 font-medium">Doctor</th>
              <th className="px-4 py-3 font-medium">Specialty</th>
              <th className="px-4 py-3 font-medium">Experience</th>
              <th className="px-4 py-3 font-medium">Rating</th>
              <th className="px-4 py-3 font-medium">Fee</th>
              <th className="px-4 py-3 font-medium">Availability</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {doctors.map((doctor) => (
              <tr
                key={doctor.id}
                className="border-b border-neutral-borderLight/60 last:border-0 hover:bg-app/50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {doctor.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={doctor.photo_url}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                        {doctor.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-text-primary">{doctor.name}</p>
                      {doctor.phone && (
                        <p className="text-xs text-text-muted">{doctor.phone}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {doctor.specialty ?? "—"}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {doctor.years_of_experience !== null
                    ? `${doctor.years_of_experience} yrs`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-text-secondary">
                    <Star className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    0.0
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-text-primary">
                  {doctor.consultation_fee !== null
                    ? formatCurrency(doctor.consultation_fee)
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <WorkingDayPills
                    workingDays={workingDays[doctor.id] ?? emptyDays}
                  />
                </td>
                <td className="px-4 py-3">
                  <Badge variant={doctor.is_visible ? "success" : "outline"}>
                    {doctor.is_visible ? "Active" : "Hidden"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {canWrite ? (
                    <div className="flex items-center gap-1">
                      <IconButton
                        label={`View ${doctor.name}`}
                        onClick={() => onView(doctor)}
                        icon={<Eye className="h-4 w-4" aria-hidden="true" />}
                      />
                      <IconButton
                        label={`Edit ${doctor.name}`}
                        onClick={() => onEdit(doctor)}
                        icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
                      />
                      <DoctorVisibilitySwitch
                        doctorId={doctor.id}
                        isVisible={doctor.is_visible}
                      />
                      <DeleteDoctorButton doctorId={doctor.id} />
                    </div>
                  ) : (
                    <span className="text-xs text-text-muted">Read-only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ServiceCard({
  service,
  workingDays,
  bookingCount,
  canWrite,
  onView,
  onEdit,
}: {
  service: Service;
  workingDays: boolean[];
  bookingCount: number;
  canWrite: boolean;
  onView: () => void;
  onEdit: () => void;
}) {
  const durationText = service.duration_or_report_time
    ? service.duration_or_report_time
    : formatDuration(service.duration_minutes);
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
              <Stethoscope className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-text-primary">
                {service.name}
              </p>
              <p className="text-sm text-primary break-words">
                {categoryLabel(service.category)}
              </p>
            </div>
          </div>
          <span
            title={service.status === "active" ? "Active" : "Inactive"}
            className={cn(
              "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
              service.status === "active"
                ? "bg-status-success"
                : "bg-status-destructive/60",
            )}
          >
            <span className="sr-only">
              {service.status === "active" ? "Active" : "Inactive"}
            </span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-control border border-neutral-borderLight bg-app/50 px-3 py-2">
            <Star className="h-4 w-4 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-text-primary">0</p>
              <p className="text-xs text-text-muted">Rating</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-control border border-neutral-borderLight bg-app/50 px-3 py-2">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {bookingCount}
              </p>
              <p className="text-xs text-text-muted">Bookings</p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-text-muted">Available days</p>
          <WorkingDayPills workingDays={workingDays} />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-control border border-neutral-borderLight bg-app/50 px-3 py-2 text-sm">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-text-secondary">
            <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{durationText}</span>
          </span>
          <span className="font-medium text-text-primary">
            {formatCurrency(service.price)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-neutral-borderLight pt-3">
          <Button variant="outline" size="sm" onClick={onView}>
            <Eye aria-hidden="true" />
            View Detail
          </Button>
          {canWrite && (
            <div className="flex items-center gap-1">
              <IconButton
                label={`Edit ${service.name}`}
                onClick={onEdit}
                icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
              />
              <ServiceActiveToggle serviceId={service.id} status={service.status} />
              <ServiceDeleteIconButton serviceId={service.id} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceTable({
  services,
  workingDays,
  bookingCounts,
  canWrite,
  onView,
  onEdit,
}: {
  services: Service[];
  workingDays: Record<string, boolean[]>;
  bookingCounts: Record<string, number>;
  canWrite: boolean;
  onView: (service: Service) => void;
  onEdit: (service: Service) => void;
}) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-borderLight text-xs font-semibold uppercase tracking-wider text-text-muted">
              <th className="px-4 py-3 font-medium">Service</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Rating</th>
              <th className="px-4 py-3 font-medium">Bookings</th>
              <th className="px-4 py-3 font-medium">Duration / Report</th>
              <th className="px-4 py-3 font-medium">Availability</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr
                key={service.id}
                className="border-b border-neutral-borderLight/60 last:border-0 hover:bg-app/50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Stethoscope className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-text-primary">{service.name}</p>
                      <p className="truncate text-xs text-text-muted">
                        {formatCurrency(service.price)}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-text-secondary">
                    {categoryLabel(service.category)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-text-secondary">
                    <Star className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    0
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-text-secondary">
                    <Users className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {bookingCounts[service.id] ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-text-primary">
                  {service.duration_or_report_time
                    ? service.duration_or_report_time
                    : formatDuration(service.duration_minutes)}
                </td>
                <td className="px-4 py-3">
                  <WorkingDayPills workingDays={workingDays[service.id] ?? emptyDays} />
                </td>
                <td className="px-4 py-3">
                  <Badge variant={service.status === "active" ? "success" : "outline"}>
                    {service.status === "active" ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {canWrite ? (
                    <div className="flex items-center gap-1">
                      <IconButton
                        label={`View ${service.name}`}
                        onClick={() => onView(service)}
                        icon={<Eye className="h-4 w-4" aria-hidden="true" />}
                      />
                      <IconButton
                        label={`Edit ${service.name}`}
                        onClick={() => onEdit(service)}
                        icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
                      />
                      <ServiceActiveToggle
                        serviceId={service.id}
                        status={service.status}
                      />
                      <ServiceDeleteIconButton serviceId={service.id} />
                    </div>
                  ) : (
                    <span className="text-xs text-text-muted">Read-only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Compact active/inactive switch for service cards and the table. Reuses the
 * same `setServiceStatusAction` as the standalone Services page, then
 * refreshes server components.
 */
function ServiceActiveToggle({
  serviceId,
  status,
}: {
  serviceId: string;
  status: Service["status"];
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    setServiceStatusAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  const active = status === "active";
  const next = active ? "inactive" : "active";

  return (
    <form action={formAction} title={active ? "Active — deactivate" : "Inactive — activate"}>
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="status" value={next} />
      <button
        type="submit"
        role="switch"
        aria-checked={active}
        aria-label={active ? `Deactivate ${serviceId}` : `Activate ${serviceId}`}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30",
          active ? "bg-primary" : "bg-text-muted/40",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
            active ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </form>
  );
}

function ServiceDeleteIconButton({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    deleteServiceAction,
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
        <input type="hidden" name="serviceId" value={serviceId} />
        <button
          type="submit"
          aria-label={`Remove service`}
          title="Remove service"
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-status-destructive/10 hover:text-status-destructive focus:outline-none focus:ring-2 focus:ring-status-destructive/30"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
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

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

function IconButton({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-app hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      {icon}
    </button>
  );
}

/**
 * Compact active/hidden switch for doctor cards and the table. Submits the
 * same `setDoctorVisibilityAction` the standalone button uses, then refreshes.
 */
function DoctorVisibilitySwitch({
  doctorId,
  isVisible,
}: {
  doctorId: string;
  isVisible: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    setDoctorVisibilityAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} title={isVisible ? "Active — hide" : "Hidden — make bookable"}>
      <input type="hidden" name="doctorId" value={doctorId} />
      <input type="hidden" name="isVisible" value={isVisible ? "off" : "on"} />
      <button
        type="submit"
        role="switch"
        aria-checked={isVisible}
        aria-label={isVisible ? `Hide ${doctorId} from booking` : `Make ${doctorId} bookable`}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30",
          isVisible ? "bg-primary" : "bg-text-muted/40",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
            isVisible ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </form>
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
        <button
          type="submit"
          aria-label={`Remove doctor`}
          title="Remove doctor"
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-status-destructive/10 hover:text-status-destructive focus:outline-none focus:ring-2 focus:ring-status-destructive/30"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
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