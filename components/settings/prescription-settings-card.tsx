"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FilePen,
  Pill,
  type LucideIcon,
} from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { ManageMedicinesDialog } from "@/components/settings/manage-medicines-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { updatePrescriptionSettingsAction } from "@/lib/actions/settings";
import type { ActionResult } from "@/types";

/** Tinted icon chip, matching the reference's `rgb(238,240,251)` panel. */
function IconChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
      {children}
    </span>
  );
}

/** Icons inside buttons are sized by the button; no size class on the icon. */
function ButtonIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon data-icon="inline-start" aria-hidden="true" />;
}

/**
 * Organization settings → Prescription.
 *
 * One preference on this screen, and it is a real one: turning the header off
 * changes what both print paths output, so the switch is saved through
 * `updatePrescriptionSettingsAction` rather than applied locally.
 *
 * The "Manage Medicines" button opens the catalogue dialog. It sits in the card
 * header because that is where the reference puts it — the catalogue is a
 * separate, larger surface, so it gets its own dialog instead of being inlined
 * into a settings card that would then own two unrelated save states.
 */
export function PrescriptionSettingsCard({
  initialShowHeader,
  canWrite,
}: {
  initialShowHeader: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updatePrescriptionSettingsAction,
    null,
  );

  const [showHeader, setShowHeader] = useState(initialShowHeader);
  const [medicinesOpen, setMedicinesOpen] = useState(false);

  // The saved value is the source of truth after a save; without this the switch
  // would keep showing the pre-save position if a refresh replaced the props.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  useEffect(() => {
    if (state?.ok) setShowHeader(initialShowHeader);
  }, [state, initialShowHeader]);

  const submitted = state !== null;
  const dirty = showHeader !== initialShowHeader;

  return (
    <Card>
      <form action={formAction}>
        <input
          type="hidden"
          name="showPrescriptionHeader"
          value={showHeader ? "true" : "false"}
        />

        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-hairline">
          <div className="flex min-w-0 items-center gap-3">
            <IconChip>
              <FilePen className="size-[18px]" aria-hidden="true" />
            </IconChip>
            <div className="min-w-0">
              <CardTitle>Prescription</CardTitle>
              <CardDescription className="mt-0.5">
                Prescription print and header related settings.
              </CardDescription>
            </div>
          </div>

          <Button
            type="button"
            variant="primary"
            onClick={() => setMedicinesOpen(true)}
            disabled={!canWrite}
            title={
              canWrite
                ? undefined
                : "Only owners and admins can manage the medicine list."
            }
          >
            <ButtonIcon icon={Pill} />
            Manage Medicines
          </Button>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {submitted && !state.ok && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}
          {submitted && state.ok && (
            <Alert variant="success">
              <CheckCircle2 aria-hidden="true" />
              <AlertDescription>Prescription settings saved.</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">
                Show Prescription Header
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                Turn this option off to hide the clinic&apos;s default print
                header and use your own custom header instead.
              </p>
            </div>
            <Switch
              checked={showHeader}
              onCheckedChange={setShowHeader}
              disabled={!canWrite}
              aria-label="Show Prescription Header"
            />
          </div>

          {/* The reference states the effect of the switch directly under it, in
              a brand-tinted panel. Kept in the DOM in both states so the copy is
              present for assistive tech and for a printer, not only for the
              enabled case. */}
          <Alert
            variant={showHeader ? "default" : "warning"}
            className={
              showHeader
                ? "border-primary/30 bg-primary/10 text-primary"
                : undefined
            }
          >
            <AlertDescription>
              {showHeader
                ? "Header ON — Shows clinic name, address, and doctor details on the prescription."
                : "Header OFF — Prescriptions print without the clinic header, for use with your own letterhead."}
            </AlertDescription>
          </Alert>
        </CardContent>

        {canWrite && (
          <CardFooter className="justify-end border-t border-hairline-soft">
            <SubmitButton loadingText="Saving…" disabled={!dirty}>
              Save Changes
            </SubmitButton>
          </CardFooter>
        )}
      </form>

      <ManageMedicinesDialog
        open={medicinesOpen}
        onOpenChange={setMedicinesOpen}
        canWrite={canWrite}
      />
    </Card>
  );
}
