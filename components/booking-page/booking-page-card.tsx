"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { BookingQrDownload } from "@/components/settings/booking-qr-download";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import {
  checkBookingSlugAvailability,
  updateBookingSettingsAction,
} from "@/lib/actions/booking-settings";
import {
  buildBookingUrl,
  buildEmbedSnippet,
  copyText,
} from "@/lib/booking-url";
import { cn } from "@/lib/utils";
import { SLOT_DURATION_MINUTES } from "@/lib/validation/booking-settings";

/**
 * Booking page control panel (Phase 23).
 *
 * Everything on screen is derived from the clinic row passed in by the server
 * page, and every control writes straight back through
 * `updateBookingSettingsAction`. An earlier version of this card kept
 * everything in local `useState` with no save handler at all, so the toggles
 * and slug looked editable but nothing was ever persisted.
 */

type Props = {
  clinicName: string;
  /** The clinic's own slug — the fallback when no custom slug is set. */
  clinicSlug: string;
  /** Origin the links should point at, resolved server-side. */
  baseUrl: string;
  initialBookingSlug: string | null;
  initialIsPublicBookingEnabled: boolean;
  initialSlotDurationMinutes: number;
  initialMaxAdvanceDays: number | null;
  initialAutoApproveBookings: boolean;
};

type SlugState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "unavailable"; reason: string };

export function BookingPageCard({
  clinicName,
  clinicSlug,
  baseUrl,
  initialBookingSlug,
  initialIsPublicBookingEnabled,
  initialSlotDurationMinutes,
  initialMaxAdvanceDays,
  initialAutoApproveBookings,
}: Props) {
  const [isEnabled, setIsEnabled] = useState(initialIsPublicBookingEnabled);
  const [autoApprove, setAutoApprove] = useState(initialAutoApproveBookings);
  const [slotDuration, setSlotDuration] = useState(
    String(initialSlotDurationMinutes),
  );
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(
    initialMaxAdvanceDays === null ? "" : String(initialMaxAdvanceDays),
  );
  const [slugInput, setSlugInput] = useState(initialBookingSlug ?? "");
  const [slugState, setSlugState] = useState<SlugState>({ status: "idle" });

  const [isSaving, startSave] = useTransition();
  const [isSavingSlug, startSlugSave] = useTransition();

  // Guards against a slow availability response for an old slug overwriting
  // the verdict for the one the user is currently typing.
  const slugRequestId = useRef(0);

  const effectiveSlug = slugInput.trim() || clinicSlug;
  const bookingUrl = buildBookingUrl(effectiveSlug, baseUrl);
  const embedSnippet = buildEmbedSnippet(
    effectiveSlug,
    baseUrl,
    `Book an appointment at ${clinicName}`,
  );

  /**
   * Send the whole panel to the server.
   *
   * `maxAdvanceDays` is sent as `""` when blank so the schema's optional
   * number field maps it back to `null` — "no limit", distinct from 0.
   */
  const save = useCallback(
    (
      overrides: Partial<{
        isPublicBookingEnabled: boolean;
        autoApproveBookings: boolean;
        slotDurationMinutes: number;
        maxAdvanceDays: number | null;
        bookingSlug: string | null;
      }> = {},
    ) => {
      startSave(async () => {
        const result = await updateBookingSettingsAction({
          bookingSlug: slugInput,
          isPublicBookingEnabled: isEnabled,
          slotDurationMinutes: Number(slotDuration),
          maxAdvanceDays: maxAdvanceDays === "" ? null : Number(maxAdvanceDays),
          autoApproveBookings: autoApprove,
          ...overrides,
        });

        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast.success("Booking page settings saved");
      });
    },
    [autoApprove, isEnabled, maxAdvanceDays, slotDuration, slugInput],
  );

  /**
   * Debounced availability check.
   *
   * Driven by an effect keyed on `slugInput` rather than by the change
   * handler. A timer created inside an event handler cannot be cancelled — the
   * handler returns before the next keystroke — so every character queued its
   * own request and the last response to land won, which is how the badge used
   * to show a verdict for a slug that was no longer in the field.
   */
  useEffect(() => {
    const slug = slugInput.trim();

    if (slug.length === 0) {
      setSlugState({ status: "idle" });
      return;
    }

    setSlugState({ status: "checking" });
    const requestId = ++slugRequestId.current;

    const timer = setTimeout(async () => {
      const result = await checkBookingSlugAvailability(slug);
      // Discard a response that a newer keystroke has already superseded.
      if (requestId !== slugRequestId.current) return;

      if (result.available) {
        setSlugState({ status: "available" });
      } else {
        setSlugState({ status: "unavailable", reason: result.reason });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slugInput]);

  /** Copy helper that reports failure instead of silently doing nothing. */
  const handleCopy = useCallback(async (text: string, what: string) => {
    const ok = await copyText(text);
    if (ok) {
      toast.success(`${what} copied to clipboard`);
    } else {
      toast.error(
        "Could not copy automatically. Your browser blocked clipboard access — select the text and copy it manually.",
      );
    }
  }, []);

  const slugIsBlocked = slugState.status === "unavailable";

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* Public link                                                      */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Your booking link</CardTitle>
              <CardDescription>
                Share this link with patients. It opens the booking page for{" "}
                {clinicName}.
              </CardDescription>
            </div>
            {isEnabled ? (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                Live
              </Badge>
            ) : (
              <Badge variant="outline">Off</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={bookingUrl}
              aria-label="Public booking link"
              className="bg-muted font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCopy(bookingUrl, "Booking link")}
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>
              <Button asChild variant="outline">
                <a href={bookingUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open
                  <span className="sr-only">booking link in a new tab</span>
                </a>
              </Button>
            </div>
          </div>

          {!isEnabled ? (
            <p className="text-muted-foreground text-xs">
              Booking is currently turned off. The link still resolves, but
              patients see a &ldquo;booking unavailable&rdquo; message until you
              turn it back on.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Booking page settings                                            */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Booking page settings</CardTitle>
          <CardDescription>
            Changes save automatically as you change them.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Accept bookings */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="booking-enabled">Accept bookings</Label>
              <p className="text-muted-foreground text-sm">
                Turn this off to pause new bookings without breaking links you
                have already shared.
              </p>
            </div>
            <Switch
              id="booking-enabled"
              checked={isEnabled}
              disabled={isSaving}
              onCheckedChange={(checked) => {
                // Optimistic: the switch has to move under the cursor, and the
                // action rolls the value back if the save fails.
                setIsEnabled(checked);
                save({ isPublicBookingEnabled: checked });
              }}
            />
          </div>

          {/* Auto approve */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="booking-auto-approve">
                Confirm bookings automatically
              </Label>
              <p className="text-muted-foreground text-sm">
                When off, each request waits for you to approve it from the
                appointments page.
              </p>
            </div>
            <Switch
              id="booking-auto-approve"
              checked={autoApprove}
              disabled={isSaving}
              onCheckedChange={(checked) => {
                setAutoApprove(checked);
                save({ autoApproveBookings: checked });
              }}
            />
          </div>

          {/* Slot duration */}
          <div className="space-y-2">
            <Label htmlFor="booking-slot-duration">Appointment length</Label>
            <NativeSelect
              id="booking-slot-duration"
              value={slotDuration}
              disabled={isSaving}
              onChange={(event) => {
                const value = event.target.value;
                setSlotDuration(value);
                save({ slotDurationMinutes: Number(value) });
              }}
              className="sm:max-w-[220px]"
            >
              {SLOT_DURATION_MINUTES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </NativeSelect>
            <p className="text-muted-foreground text-xs">
              The size of each bookable time slot.
            </p>
          </div>

          {/* Max advance days */}
          <div className="space-y-2">
            <Label htmlFor="booking-max-advance">Book up to (days ahead)</Label>
            <Input
              id="booking-max-advance"
              type="number"
              min={1}
              max={90}
              placeholder="No limit"
              value={maxAdvanceDays}
              disabled={isSaving}
              onChange={(event) => setMaxAdvanceDays(event.target.value)}
              onBlur={() =>
                save({
                  maxAdvanceDays:
                    maxAdvanceDays === "" ? null : Number(maxAdvanceDays),
                })
              }
              className="sm:max-w-[220px]"
            />
            <p className="text-muted-foreground text-xs">
              Leave empty for no limit. Patients cannot book beyond this many
              days ahead.
            </p>
          </div>

          {/* Save button — the numeric fields above save on blur, this saves
              everything at once. */}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={() => save()}
              disabled={isSaving || slugIsBlocked}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
            {slugIsBlocked ? (
              <span className="text-destructive text-xs">
                Fix the link name before saving.
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Link name                                                        */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Custom link name</CardTitle>
          <CardDescription>
            Optional. Leave it empty to use your clinic name as the link.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <Label htmlFor="booking-slug" className="sr-only">
            Custom link name
          </Label>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-muted-foreground shrink-0 font-mono text-sm">
              {baseUrl.replace(/^https?:\/\//i, "")}/book/
            </span>
            <div className="relative flex-1">
              <Input
                id="booking-slug"
                value={slugInput}
                onChange={(event) =>
                  setSlugInput(
                    event.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, ""),
                  )
                }
                placeholder={clinicSlug}
                aria-invalid={slugIsBlocked}
                aria-describedby="booking-slug-status"
                className={cn(
                  slugIsBlocked && "border-destructive focus-visible:border-destructive",
                )}
              />
              <span className="absolute top-1/2 right-3 -translate-y-1/2">
                {slugState.status === "checking" ? (
                  <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                ) : slugState.status === "available" ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : null}
              </span>
            </div>
          </div>

          <p
            id="booking-slug-status"
            className={cn(
              "text-xs",
              slugIsBlocked ? "text-destructive" : "text-muted-foreground",
            )}
            role="status"
            aria-live="polite"
          >
            {slugState.status === "checking"
              ? "Checking availability…"
              : slugState.status === "available"
                ? "That link is available."
                : slugIsBlocked
                  ? slugState.reason
                  : `Leave empty to use ${clinicSlug}.`}
          </p>

          <Button
            type="button"
            variant="outline"
            disabled={isSavingSlug || slugIsBlocked}
            onClick={() => {
              const next = slugInput.trim() || null;
              startSlugSave(async () => {
                const result = await updateBookingSettingsAction({
                  bookingSlug: slugInput,
                  isPublicBookingEnabled: isEnabled,
                  slotDurationMinutes: Number(slotDuration),
                  maxAdvanceDays:
                    maxAdvanceDays === "" ? null : Number(maxAdvanceDays),
                  autoApproveBookings: autoApprove,
                });
                if (!result.ok) {
                  toast.error(result.message);
                  return;
                }
                toast.success(
                  next
                    ? `Link saved: ${buildBookingUrl(next, baseUrl)}`
                    : "Custom link removed",
                );
              });
            }}
          >
            {isSavingSlug ? "Saving…" : "Save link name"}
          </Button>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* QR code                                                          */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>QR code</CardTitle>
          <CardDescription>
            A scannable code that opens your booking page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BookingQrDownload url={bookingUrl} clinicName={clinicName} />
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Embed                                                            */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Embed on your website</CardTitle>
          <CardDescription>
            Paste this into any page on your website to show the booking form
            inline.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <pre className="bg-muted text-muted-foreground overflow-x-auto rounded-md p-3 font-mono text-xs">
            <code>{embedSnippet}</code>
          </pre>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleCopy(embedSnippet, "Embed code")}
          >
            <Copy className="h-4 w-4" />
            Copy embed code
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
