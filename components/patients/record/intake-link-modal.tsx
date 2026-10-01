"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ClipboardCopy, Link2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createPatientIntakeTokenAction } from "@/lib/actions/patient-intake-actions";

function shareUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

/**
 * "Intake link" modal — hands the clinic a one-time, 7-day shareable link to a
 * patient's pre-intake health-history form (module 1's staff side).
 *
 * The link is minted the moment the modal opens and shown ready to copy, since
 * it is a capability: the raw token exists nowhere except this URL. The one
 * clear action is Copy, so a phone-holding receptionist can paste it straight
 * into WhatsApp.
 */
export function IntakeLinkModal({
  patientId,
  patientFirstName,
  onClose,
}: {
  patientId: string;
  patientFirstName?: string;
  onClose: () => void;
}) {
  const [minting, setMinting] = useState(true);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function mint() {
    setMinting(true);
    setError(null);
    setLink(null);
    const data = new FormData();
    data.set("patientId", patientId);
    void createPatientIntakeTokenAction(null, data).then((result) => {
      setMinting(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setLink(shareUrl(result.data?.path ?? ""));
    });
  }

  useEffect(() => {
    if (!patientId) return;
    mint();
    // `mint` reads only stable props; run once per patient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  function copy() {
    if (!link) return;
    void navigator.clipboard.writeText(link).then(() => {
      toast.success("Intake link copied.");
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-secondary/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Send patient intake link"
    >
      <div className="relative my-8 w-full max-w-lg flex-col rounded-2xl border border-hairline bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between rounded-t-2xl bg-gradient-to-r from-primary to-primary-light px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-white/20">
              <Link2 aria-hidden="true" className="size-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Patient intake link</h2>
              <p className="text-xs text-white/80">
                Share with {patientFirstName?.trim() || "the patient"} before the visit
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={minting}
            className="group flex size-8 items-center justify-center rounded-lg bg-white text-primary shadow-sm transition-colors hover:bg-white/90"
            aria-label="Close"
          >
            <X
              aria-hidden="true"
              className="size-4 transition-transform duration-200 group-hover:rotate-90"
            />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          {error && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p
                role="alert"
                className="text-xs font-medium leading-relaxed text-red-700"
              >
                {error}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={mint}>
                Try again
              </Button>
            </div>
          )}

          {minting ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Spinner />
              <div>
                <p className="text-sm font-semibold text-ink">Creating your link…</p>
                <p className="text-xs text-ink-faint">This usually takes a second.</p>
              </div>
            </div>
          ) : (
            link && (
              <>
                <div className="flex items-start justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
                      One-time link
                    </p>
                    <p className="mt-1 break-all text-[12.5px] font-semibold leading-snug text-ink">
                      {link}
                    </p>
                    <p className="mt-1.5 text-[11px] text-ink-faint">
                      Works for 7 days, then expires. Completing the form uses it up.
                    </p>
                  </div>
                </div>

                <Button type="button" className="gap-1.5" onClick={copy}>
                  <ClipboardCopy aria-hidden="true" className="size-4" />
                  Copy link
                </Button>

                <p className="text-center text-[11px] leading-relaxed text-ink-faint">
                  Your patient fills in their past illnesses, surgeries and family
                  history on their phone. Entries arrive on the History tab with a{" "}
                  <span className="font-semibold text-ink">Needs review</span> tag,
                  just like scanned documents.
                </p>
              </>
            )
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 rounded-b-2xl border-t border-hairline bg-app/50 px-5 py-3.5">
          <Button type="button" size="sm" onClick={onClose} disabled={minting}>
            <Check aria-hidden="true" className="size-3.5" />
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}