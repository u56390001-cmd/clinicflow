"use client";

/**
 * Fast-track clinic onboarding wizard (migration 0074).
 *
 * Three steps — facility shape, clinic details, first staff invites — sharing
 * one mobile-first surface. The whole flow is a single validated server action
 * (`createClinicOnboardingAction`), so nothing can be half-applied. All visual
 * language uses the system teal tokens; the only signature element is the
 * facility-type selection cards.
 */

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Hospital,
  MapPin,
  Network,
  Plus,
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";
import { useState, useTransition } from "react";

import { ROLE_LABELS } from "@/lib/auth/rbac-config";
import { createClinicOnboardingAction } from "@/lib/actions/onboarding";
import {
  COMMON_TIMEZONES,
  FACILITY_SIZE_LABELS,
  ORGANIZATION_TYPE_LABELS,
} from "@/lib/constants";
import type { ClinicRole, FacilitySize, OrganizationType } from "@/types/database";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Your facility", eyebrow: "Step 1 of 3" },
  { title: "Clinic details", eyebrow: "Step 2 of 3" },
  { title: "Invite your team", eyebrow: "Step 3 of 3" },
] as const;

const FACILITY_OPTIONS: {
  value: OrganizationType;
  description: string;
  icon: typeof Stethoscope;
}[] = [
  {
    value: "clinic",
    description: "A private clinic or practice",
    icon: Stethoscope,
  },
  {
    value: "polyclinic",
    description: "Several specialties under one roof",
    icon: Building2,
  },
  {
    value: "hospital",
    description: "A hospital or large care facility",
    icon: Hospital,
  },
];

const SIZE_OPTIONS: {
  value: FacilitySize;
  description: string;
  icon: typeof MapPin;
}[] = [
  {
    value: "single_location",
    description: "Just this site for now",
    icon: MapPin,
  },
  {
    value: "multi_branch",
    description: "We already run, or plan, several sites",
    icon: Network,
  },
];

const INVITE_ROLES: ClinicRole[] = [
  "clinic_admin",
  "doctor",
  "receptionist",
  "nurse",
  "accountant",
];

type InviteRow = { email: string; role: ClinicRole };

const emptyInvite = (): InviteRow => ({ email: "", role: "receptionist" });

export function OnboardingWizard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);

  const [organizationType, setOrganizationType] = useState<OrganizationType | null>(null);
  const [facilitySize, setFacilitySize] = useState<FacilitySize | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [invites, setInvites] = useState<InviteRow[]>([emptyInvite()]);

  const stepReady = [
    organizationType !== null && facilitySize !== null,
    name.trim().length > 0 && timezone.length > 0,
    true,
  ][step];

  const firstNameWord = name.trim().split(/\s+/)[0] || "your clinic";

  const goTo = (next: number) => {
    if (next < 0 || next > 2) return;
    setError(null);
    setNotice(null);
    setStep(next);
    setFurthest((current) => Math.max(current, next));
  };

  const submit = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await createClinicOnboardingAction({
        name: name.trim(),
        organizationType,
        facilitySize,
        timezone,
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        city: city.trim(),
        invites: invites.filter((invite) => invite.email.trim().length > 0),
      });
      if (result.ok) {
        const failed = result.invites.filter((invite) => !invite.sent);
        if (failed.length > 0) {
          setNotice(
            `Invite emails couldn't be delivered for ${failed
              .map((invite) => invite.email)
              .join(", ")}. You can resend them from Team settings.`,
          );
        }
        router.push(result.redirectUrl);
        router.refresh();
        return;
      }
      setError(result.message);
    });
  };

  return (
    <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Left rail — vertical stepper on desktop */}
      <aside className="hidden lg:flex flex-col gap-6">
        <div>
          <p className="text-sm font-medium text-primary">Set up your clinic</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
            {name.trim() ? name.trim() : "Welcome"}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Two minutes to a working clinic — you can fill in the rest later.
          </p>
        </div>

        <ol className="space-y-1">
          {STEPS.map((item, index) => {
            const done = index < step;
            const active = index === step;
            return (
              <li key={item.title}>
                <button
                  type="button"
                  onClick={() => active || done ? goTo(index) : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-control px-2 py-2.5 text-left transition-colors",
                    !active && !done && "cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      done && "border-primary bg-primary text-white",
                      active && "border-primary text-primary",
                      !done && !active && "border-text-muted/40 text-text-muted",
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-sm font-medium",
                        active ? "text-text-primary" : done ? "text-text-secondary" : "text-text-muted",
                      )}
                    >
                      {item.title}
                    </span>
                    {item.eyebrow ? (
                      <span className="block text-xs text-primary">{item.eyebrow}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-auto rounded-card border border-primary-tint-border bg-primary-tint p-4">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          <p className="mt-2 text-sm text-text-secondary">
            You become the owner of {firstNameWord}. You can add more clinics
            and teammates whenever you like.
          </p>
        </div>
      </aside>

      {/* Main surface */}
      <div className="rounded-card border border-hairline bg-surface shadow-card">
        {/* Mobile progress header */}
        <div className="border-b border-hairline px-5 pt-5 lg:hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-primary">{STEPS[step].eyebrow}</p>
              <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-text-primary">
                {STEPS[step].title}
              </h1>
            </div>
            <span className="text-xs font-medium text-text-muted">
              {((furthest + 1) * 100) / STEPS.length}%
            </span>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-hairline-soft">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${((furthest + 1) * 100) / STEPS.length}%` }}
            />
          </div>
        </div>

        <div className="p-5 sm:p-8">
          {error ? (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {notice ? (
            <Alert className="mb-6">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}

          {step === 0 ? (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-text-primary">
                  What are you setting up?
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Pick the option closest to you — you can change it in settings.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {FACILITY_OPTIONS.map((option) => {
                  const selected = organizationType === option.value;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setOrganizationType(option.value)}
                      className={cn(
                        "relative rounded-control border p-4 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary-tint"
                          : "border-hairline bg-surface hover:border-primary/50",
                      )}
                    >
                      {selected ? (
                        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                          <Check className="h-3 w-3" aria-hidden="true" />
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-control",
                          selected ? "bg-primary/10 text-primary" : "bg-app text-text-muted",
                        )}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="mt-3 block text-sm font-semibold text-text-primary">
                        {ORGANIZATION_TYPE_LABELS[option.value]}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                        {option.description}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div>
                <h3 className="text-sm font-medium text-text-primary">How many locations?</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {SIZE_OPTIONS.map((option) => {
                    const selected = facilitySize === option.value;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setFacilitySize(option.value)}
                        className={cn(
                          "flex items-start gap-3 rounded-control border p-4 text-left transition-colors",
                          selected
                            ? "border-primary bg-primary-tint"
                            : "border-hairline bg-surface hover:border-primary/50",
                        )}
                      >
                        <Icon
                          className={cn(
                            "mt-0.5 h-4 w-4 shrink-0",
                            selected ? "text-primary" : "text-text-muted",
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-text-primary">
                            {optionLabel(option.value)}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-text-secondary">
                            {option.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-text-primary">
                  A few details
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  These appear on your bookings and receipts — you can edit them later.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard-name">Clinic name</Label>
                <Input
                  id="wizard-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Sunrise Family Clinic"
                  autoComplete="organization"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard-timezone">Timezone</Label>
                <NativeSelect
                  id="wizard-timezone"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                >
                  {COMMON_TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wizard-phone">Phone</Label>
                  <Input
                    id="wizard-phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wizard-email">Contact email</Label>
                  <Input
                    id="wizard-email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    placeholder="front@clinic.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_180px]">
                <div className="space-y-2">
                  <Label htmlFor="wizard-address">Street address</Label>
                  <Input
                    id="wizard-address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="123 Main Street"
                    autoComplete="street-address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wizard-city">City</Label>
                  <Input
                    id="wizard-city"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Springfield"
                    autoComplete="address-level2"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-text-primary">
                    Invite your team
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Each person gets a secure, single-use link. You can skip this
                    and invite people from the Team page any time.
                  </p>
                </div>
                <Badge variant="default" className="shrink-0">
                  Optional
                </Badge>
              </div>

              <div className="space-y-3">
                {invites.map((invite, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-control border border-hairline bg-app/60 p-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]"
                  >
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`invite-email-${index}`}
                        className="sr-only"
                      >
                        Email
                      </Label>
                      <Input
                        id={`invite-email-${index}`}
                        value={invite.email}
                        onChange={(event) =>
                          setInvites((rows) =>
                            rows.map((row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, email: event.target.value }
                                : row,
                            ),
                          )
                        }
                        type="email"
                        placeholder="colleague@clinic.com"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`invite-role-${index}`}
                        className="sr-only"
                      >
                        Role
                      </Label>
                      <NativeSelect
                        id={`invite-role-${index}`}
                        value={invite.role}
                        onChange={(event) =>
                          setInvites((rows) =>
                            rows.map((row, rowIndex) =>
                              rowIndex === index
                                ? {
                                    ...row,
                                    role: event.target.value as ClinicRole,
                                  }
                                : row,
                            ),
                          )
                        }
                      >
                        {INVITE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove invite"
                        disabled={invites.length === 1}
                        onClick={() =>
                          setInvites((rows) =>
                            rows.length === 1
                              ? rows
                              : rows.filter((_, rowIndex) => rowIndex !== index),
                          )
                        }
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setInvites((rows) =>
                    rows.length >= 10 ? rows : [...rows, emptyInvite()],
                  )
                }
                disabled={invites.length >= 10}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add another invite
              </Button>
            </div>
          ) : null}

          {/* Footer nav */}
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-hairline pt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => goTo(step - 1)}
              disabled={step === 0 || pending}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Button>

            {step < 2 ? (
              <Button
                type="button"
                onClick={() => goTo(step + 1)}
                disabled={!stepReady}
              >
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button type="button" onClick={submit} disabled={pending}>
                {pending ? "Setting up…" : "Create clinic"}
                {!pending ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Give a facility/size option its human label from the canonical maps.
function optionLabel(value: OrganizationType | FacilitySize): string {
  if (value in FACILITY_SIZE_LABELS) {
    return FACILITY_SIZE_LABELS[value as FacilitySize];
  }
  return ORGANIZATION_TYPE_LABELS[value as OrganizationType];
}