"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock, Loader2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchPublicSlots,
  submitPublicBooking,
} from "@/lib/actions/public-booking";
import { cn } from "@/lib/utils";

/**
 * Patient-facing booking form for `/book/<slug>`.
 *
 * Three steps — service, time, details — with slots fetched per date from
 * `fetchPublicSlots`. Nothing is invented client-side: the slot list is whatever
 * the server verified against working hours, blocked times and existing
 * appointments, and `submitPublicBooking` re-verifies at write time.
 */

export type PublicService = {
  id: string;
  name: string;
  price: number;
  duration: number;
};

type Props = {
  clinicId: string;
  clinicName: string;
  clinicSlug: string;
  clinicPhone: string | null;
  clinicAddress: string | null;
  timezone: string;
  services: PublicService[];
  slotDurationMinutes: number;
  maxAdvanceDays: number | null;
  autoApprove: boolean;
  baseUrl: string;
};

/** `YYYY-MM-DD` in the browser's timezone, used as the date picker's floor. */
function todayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** Last selectable date, honouring the clinic's advance-booking window. */
function maxDateIso(maxAdvanceDays: number | null): string {
  const limit = new Date();
  if (maxAdvanceDays) limit.setDate(limit.getDate() + maxAdvanceDays);
  const offsetMs = limit.getTimezoneOffset() * 60_000;
  return new Date(limit.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** "2026-03-04T09:30" -> "9:30 AM" for display only. */
function formatSlot(start: string): string {
  const time = start.split("T")[1];
  if (!time) return start;
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function BookingPageForm({
  clinicName,
  clinicSlug,
  clinicPhone,
  clinicAddress,
  services,
  slotDurationMinutes,
  maxAdvanceDays,
  autoApprove,
}: Props) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    status: "confirmed" | "pending";
    startTime: string;
  } | null>(null);

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId),
    [serviceId, services],
  );

  // The slot the patient picked belongs to the previous service or date; drop it
  // rather than letting them submit a stale time.
  useEffect(() => {
    setSlot(null);
  }, [serviceId, date]);

  // Fetch open slots whenever the service or the date changes.
  useEffect(() => {
    if (!serviceId) {
      setSlots([]);
      return;
    }

    let cancelled = false;
    setIsLoadingSlots(true);
    setSlotError(null);

      fetchPublicSlots(clinicSlug, serviceId, date)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setSlots(result.slots);
          if (result.slots.length === 0) {
            setSlotError("No open slots on this date. Please try another day.");
          }
        } else {
          setSlots([]);
          setSlotError(result.message);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSlots([]);
          setSlotError("Could not load available times. Please refresh.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [serviceId, date, clinicSlug]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!slot) {
        setSubmitError("Choose a time slot first.");
        return;
      }

      setIsSubmitting(true);
      setSubmitError(null);

      try {
        const result = await submitPublicBooking({
          slug: clinicSlug,
          serviceId,
          start: slot,
          name,
          phone,
          email,
          age: age === "" ? null : age,
          gender,
          notes,
        });

        if (result.ok) {
          setConfirmed({ status: result.status, startTime: result.startTime });
          return;
        }
        setSubmitError(result.message);
      } catch {
        setSubmitError("Something went wrong. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      age,
      email,
      gender,
      name,
      notes,
      phone,
      serviceId,
      slot,
      clinicSlug,
    ],
  );

  // ------------------------------------------------------------------
  // Success
  // ------------------------------------------------------------------
  if (confirmed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-6">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="text-text-primary mt-4 text-xl font-semibold">
              {confirmed.status === "confirmed"
                ? "Your appointment is confirmed"
                : "Your request has been received"}
            </h1>
            <p className="text-text-secondary mt-2 text-sm">
              {confirmed.status === "confirmed"
                ? `We have you booked with ${clinicName} on ${formatSlot(confirmed.startTime)}.`
                : `${clinicName} will confirm your appointment shortly. You will hear from the clinic soon.`}
            </p>
            {clinicPhone ? (
              <a
                href={`tel:${clinicPhone}`}
                className="text-primary hover:text-primary/80 mt-4 inline-block text-sm font-medium"
              >
                Need to change it? Call {clinicPhone}
              </a>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // No services: the clinic cannot take bookings yet.
  // ------------------------------------------------------------------
  if (services.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-6">
        <div className="max-w-md text-center">
          <h1 className="text-text-primary text-xl font-semibold">
            Online booking is not available yet
          </h1>
          <p className="text-text-secondary mt-2 text-sm">
            {clinicName} has not published any bookable services. Please call the
            clinic to arrange your appointment.
          </p>
          {clinicPhone ? (
            <a
              href={`tel:${clinicPhone}`}
              className="text-primary hover:text-primary/80 mt-4 inline-block text-sm font-medium"
            >
              Call {clinicPhone}
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface min-h-screen">
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-text-primary text-2xl font-semibold">
            Book an appointment
          </h1>
          <p className="text-text-secondary mt-1 text-sm">{clinicName}</p>
          {clinicAddress ? (
            <p className="text-text-secondary mt-2 flex items-center gap-1.5 text-sm">
              <MapPin className="h-4 w-4 shrink-0" />
              {clinicAddress}
            </p>
          ) : null}
        </header>

        <form onSubmit={submit} className="space-y-6">
          {/* Service */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Choose a service</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="service" className="sr-only">
                Service
              </Label>
              <NativeSelect
                id="service"
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
              >
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} — {service.duration} min
                    {service.price > 0 ? ` — ₹${service.price}` : ""}
                  </option>
                ))}
              </NativeSelect>
              {selectedService ? (
                <p className="text-muted-foreground text-xs">
                  {selectedService.duration} minutes
                  {slotDurationMinutes
                    ? ` · slots start every ${slotDurationMinutes} minutes`
                    : ""}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* Date and time */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pick a date and time</CardTitle>
              <CardDescription>
                Only times the clinic has open are shown.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="date">
                  <CalendarDays className="mr-1.5 inline h-4 w-4" />
                  Date
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  min={todayIso()}
                  max={maxDateIso(maxAdvanceDays)}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  <Clock className="mr-1.5 inline h-4 w-4" />
                  Available times
                </Label>

                {isLoadingSlots ? (
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking availability…
                  </p>
                ) : slots.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((option) => {
                      const isActive = slot === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setSlot(option)}
                          aria-pressed={isActive}
                          className={cn(
                            "rounded-md border px-2 py-2 text-sm transition-colors",
                            isActive
                              ? "border-primary bg-primary text-primary-foreground"
                              : "hover:bg-accent hover:border-primary",
                          )}
                        >
                          {formatSlot(option)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {slotError ?? "No times available."}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your details</CardTitle>
              <CardDescription>
                Used only to arrange your visit.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your full name"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    required
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="9876543210"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email (optional)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="age">Age (optional)</Label>
                  <Input
                    id="age"
                    type="number"
                    min={1}
                    max={120}
                    value={age}
                    onChange={(event) => setAge(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gender">Gender (optional)</Label>
                  <NativeSelect
                    id="gender"
                    value={gender}
                    onChange={(event) => setGender(event.target.value)}
                  >
                    <option value="">Prefer not to say</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </NativeSelect>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Anything the clinic should know?</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Reason for visit, symptoms, or accessibility needs"
                />
              </div>
            </CardContent>
          </Card>

          {submitError ? (
            <p
              role="alert"
              className="text-destructive rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
            >
              {submitError}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitting || !slot}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Booking…
              </>
            ) : autoApprove ? (
              "Confirm appointment"
            ) : (
              "Request appointment"
            )}
          </Button>

          {!slot ? (
            <p className="text-muted-foreground text-center text-xs">
              Choose a time slot to continue.
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
