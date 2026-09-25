"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarX2, CheckCircle2, Trash2 } from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  addBlockedTimeAction,
  deleteBlockedTimeAction,
} from "@/lib/actions/availability";
import {
  clinicLocalDayOfWeek,
  formatClinicLocalRange,
  utcIsoToClinicLocalInput,
} from "@/lib/time";
import { addDaysToNaive } from "@/lib/utils/datetime";
import type { ActionResult } from "@/types";
import type { BlockedTime, Doctor } from "@/types/database";

function nextMondayClinicLocal(tz: string): string {
  const local = utcIsoToClinicLocalInput(new Date().toISOString(), tz);
  const base = addDaysToNaive(local.slice(0, 10), 0);
  const day = clinicLocalDayOfWeek(local);
  let daysUntil = (1 - day + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  return addDaysToNaive(base, daysUntil);
}

export function BlockedTimesPanel({
  blockedTimes,
  timezone,
  doctors,
  canWrite,
}: {
  blockedTimes: BlockedTime[];
  timezone: string;
  doctors: Doctor[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    addBlockedTimeAction,
    null,
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");

  const submitted = state !== null;

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      setStart("");
      setEnd("");
      setReason("");
    }
  }, [state, router]);

  function defaults(): void {
    const day = nextMondayClinicLocal(timezone);
    setStart(`${day}T09:00`);
    setEnd(`${day}T17:00`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Blocked times</CardTitle>
        <CardDescription>
          Holidays, days off, or periods when the clinic is closed. A
          doctor-specific block only stops that doctor&apos;s bookings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {submitted && !state.ok && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {submitted && state.ok && (
          <Alert variant="success">
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>Blocked time added.</AlertDescription>
          </Alert>
        )}

        {canWrite && (
          <form action={formAction} className="space-y-3 rounded-control border border-text-muted/30 bg-app p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="blocked-start">Start</Label>
                <Input
                  id="blocked-start"
                  name="start"
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  onFocus={() => {
                    if (!start) defaults();
                  }}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="blocked-end">End</Label>
                <Input
                  id="blocked-end"
                  name="end"
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="blocked-reason">Reason</Label>
                <Input
                  id="blocked-reason"
                  name="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Public holiday"
                  maxLength={240}
                />
              </div>
              {doctors.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="blocked-doctor">Doctor</Label>
                  <NativeSelect id="blocked-doctor" name="doctorId" defaultValue="">
                    <option value="">Whole clinic</option>
                    {doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}
            </div>
            <SubmitButton loadingText="Adding…">Add blocked time</SubmitButton>
          </form>
        )}

        {blockedTimes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-control border border-dashed border-text-muted/40 py-8 text-center">
            <CalendarX2 className="h-5 w-5 text-text-muted" aria-hidden="true" />
            <p className="text-sm text-text-secondary">No blocked times yet.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {blockedTimes.map((block) => (
              <li key={block.id}>
                <BlockedTimeRow
                  block={block}
                  timezone={timezone}
                  doctorName={
                    doctors.find((d) => d.id === block.doctor_id)?.name ?? null
                  }
                  canWrite={canWrite}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BlockedTimeRow({
  block,
  timezone,
  doctorName,
  canWrite,
}: {
  block: BlockedTime;
  timezone: string;
  doctorName: string | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    deleteBlockedTimeAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 rounded-control border border-text-muted/30 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {formatClinicLocalRange(block.start_time, block.end_time, timezone)}
          </p>
          {(block.reason || doctorName) && (
            <p className="truncate text-xs text-text-secondary">
              {[block.reason, doctorName ? `Only ${doctorName}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {canWrite && (
          <form action={formAction} className="shrink-0">
            <input type="hidden" name="blockedTimeId" value={block.id} />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Remove blocked time"
              title="Remove"
            >
              <Trash2 className="h-4 w-4 text-status-destructive" aria-hidden="true" />
            </Button>
          </form>
        )}
      </div>
      {state && !state.ok && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle aria-hidden="true" />
          <AlertDescription className="text-xs">{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
