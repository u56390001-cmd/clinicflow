"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Copy, FileUp, Link2, Loader2, Send } from "lucide-react";

import { RecordSection } from "@/components/patients/record/record-primitives";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import {
  sendPsychAssessmentLinkAction,
  sendPsychDocumentUploadLinkAction,
  sendPsychPreVisitLinkAction,
} from "@/lib/actions/patient-links";
import { copyText } from "@/lib/booking-url";
import { PSYCHOMETRIC_INSTRUMENTS, PSYCHOMETRIC_KEYS } from "@/lib/psychometrics";
import { listInstruments } from "@/lib/scoring";
import { ASSESSMENT_RATERS, DEFAULT_RATER_TYPE } from "@/lib/assessments/raters";
import {
  LANG_ORDER,
  languageLabel,
  type AssessmentLanguage,
} from "@/lib/assessments/translations";
import type {
  AssessmentRaterType,
  AssessmentTemplate,
  PatientShareLinkDeliveryChannel,
} from "@/types/database";

const TEMPLATE_PREFIX = "tmpl:";

/** Validated instruments scored by the deterministic engine (Phase 1). */
const VALIDATED_INSTRUMENTS = listInstruments();
/** Legacy built-ins not yet on the validated engine (BDI-II). */
const LEGACY_KEYS = PSYCHOMETRIC_KEYS.filter(
  (key) => !VALIDATED_INSTRUMENTS.some((instrument) => instrument.code === key),
);

function templateOptionValue(template: AssessmentTemplate): string {
  return `${TEMPLATE_PREFIX}${template.id}`;
}

type Kind = "pre_visit" | "assessment" | "document_upload";

/**
 * Sends the patient-facing share links (pre-visit form, psychometric
 * assessment, document upload) through the clinic's existing WhatsApp channel,
 * or mints a bare link the clinician can copy and send through any other
 * channel. Every generated link is shown on screen and copied to the clipboard.
 * Answers land back in this record automatically, whichever channel was used.
 *
 * The assessment picker combines the validated instruments (deterministic
 * scoring engine) with any clinic library template (migration 0085) that is
 * scored and patient-completable.
 */
export function PatientLinksPanel({
  patientId,
  whatsappNumber,
  canManage,
  templates = [],
}: {
  patientId: string;
  whatsappNumber: string | null;
  canManage: boolean;
  templates?: AssessmentTemplate[];
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [assessmentType, setAssessmentType] = useState<string>(PSYCHOMETRIC_KEYS[0]);
  const [raterType, setRaterType] = useState<AssessmentRaterType>(DEFAULT_RATER_TYPE);
  /** Language the WhatsApp/portal message is pre-formatted in (default Roman Urdu). */
  const [messageLanguage, setMessageLanguage] = useState<AssessmentLanguage>("roman_ur");
  const [readyLink, setReadyLink] = useState<string | null>(null);
  const hasWhatsapp = (whatsappNumber ?? "").replace(/[^\d]/g, "").length > 0;
  const busy = pending !== null;

  async function generate(kind: Kind, mode: "whatsapp" | "link") {
    if (!canManage || busy) return;
    const channel: PatientShareLinkDeliveryChannel = mode === "whatsapp" ? "whatsapp" : "link";
    setPending(`${mode}:${kind}`);
    let result;
    if (kind === "assessment") {
      if (assessmentType.startsWith(TEMPLATE_PREFIX)) {
        const template = templates.find((t) => t.id === assessmentType.slice(TEMPLATE_PREFIX.length));
        result = template
          ? await sendPsychAssessmentLinkAction(
              patientId,
              template.name,
              template.id,
              null,
              channel,
              raterType,
              messageLanguage,
            )
          : { ok: false as const, message: "That assessment is no longer available." };
      } else {
        result = await sendPsychAssessmentLinkAction(
          patientId,
          assessmentType,
          null,
          null,
          channel,
          raterType,
          messageLanguage,
        );
      }
    } else if (kind === "pre_visit") {
      result = await sendPsychPreVisitLinkAction(patientId, null, channel, messageLanguage);
    } else {
      result = await sendPsychDocumentUploadLinkAction(patientId, null, channel, messageLanguage);
    }
    setPending(null);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const url = `${window.location.origin}${result.data.path}`;
    const copied = await copyText(url);
    setReadyLink(url);

    if (mode === "link") {
      toast.success(copied ? "Link copied ✓ — send it via any channel" : "Link ready below");
    } else if (result.data.whatsappSent) {
      toast.success(copied ? "Sent on WhatsApp · link copied" : "Sent on WhatsApp");
    } else {
      toast("Link ready — couldn't send on WhatsApp", {
        description: "Copy the link below and send it manually.",
      });
    }
  }

  async function copyReadyLink() {
    if (!readyLink) return;
    const ok = await copyText(readyLink);
    if (ok) toast.success("Link copied");
    else toast.error("Couldn't copy — select the link and copy it manually");
  }

  function actionRow(kind: Kind) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[130px]">
          <NativeSelect
            aria-label="Message language"
            value={messageLanguage}
            disabled={!canManage || busy}
            onChange={(event) => setMessageLanguage(event.target.value as AssessmentLanguage)}
            className="h-8 py-1 text-[11.5px]"
          >
            {LANG_ORDER.map((lang) => (
              <option key={lang} value={lang}>
                {languageLabel(lang)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canManage || busy || !hasWhatsapp}
          title={
            hasWhatsapp
              ? "Send the form on WhatsApp"
              : "Add a WhatsApp number to send on WhatsApp"
          }
          onClick={() => generate(kind, "whatsapp")}
        >
          {pending === `whatsapp:${kind}` ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          Send on WhatsApp
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!canManage || busy}
          title="Generate the link and copy it to send yourself"
          onClick={() => generate(kind, "link")}
        >
          {pending === `link:${kind}` ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          Copy link
        </Button>
      </div>
    );
  }

  return (
    <RecordSection title="Send patient links">
      <div className="space-y-3">
        <p className="text-[12px] leading-relaxed text-text-secondary">
          Send a secure form over WhatsApp, or generate a link and send it yourself. Answers appear
          in this record automatically. Pick the language of the pre-formatted message first —
          patients can still switch between Urdu, Roman Urdu and English inside the form.
        </p>

        <div className="rounded-control border border-hairline bg-app p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
            <ClipboardList className="size-3.5 text-primary" aria-hidden="true" />
            Pre-visit form
          </p>
          {actionRow("pre_visit")}
        </div>

        <div className="rounded-control border border-hairline bg-app p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
            <FileUp className="size-3.5 text-primary" aria-hidden="true" />
            Document upload
          </p>
          {actionRow("document_upload")}
        </div>

        <div className="space-y-3 rounded-control border border-hairline bg-app p-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
            <ClipboardList className="size-3.5 text-primary" aria-hidden="true" />
            Assessment
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px]">
              <label
                htmlFor="psych-link-assessment"
                className="text-[12.5px] font-bold text-ink"
              >
                Assessment
              </label>
              <NativeSelect
                id="psych-link-assessment"
                value={assessmentType}
                disabled={!canManage || busy}
                onChange={(event) => setAssessmentType(event.target.value)}
              >
                <optgroup label="Validated instruments">
                  {VALIDATED_INSTRUMENTS.map((instrument) => (
                    <option key={instrument.code} value={instrument.code}>
                      {instrument.shortName}
                    </option>
                  ))}
                </optgroup>
                {LEGACY_KEYS.length > 0 ? (
                  <optgroup label="Built-in">
                    {LEGACY_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {PSYCHOMETRIC_INSTRUMENTS[key].shortName}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {templates.length > 0 ? (
                  <optgroup label="Assessment Library">
                    {templates.map((template) => (
                      <option key={template.id} value={templateOptionValue(template)}>
                        {template.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </NativeSelect>
            </div>
            <div className="min-w-[150px]">
              <label
                htmlFor="psych-link-respondent"
                className="text-[12.5px] font-bold text-ink"
              >
                Respondent
              </label>
              <NativeSelect
                id="psych-link-respondent"
                value={raterType}
                disabled={!canManage || busy}
                onChange={(event) => setRaterType(event.target.value as AssessmentRaterType)}
              >
                {ASSESSMENT_RATERS.map((rater) => (
                  <option key={rater.value} value={rater.value}>
                    {rater.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          {actionRow("assessment")}
        </div>

        {readyLink && (
          <div className="rounded-control border border-primary/20 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              <Link2 className="size-3" aria-hidden="true" />
              Link ready
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                readOnly
                value={readyLink}
                onFocus={(event) => event.currentTarget.select()}
                className="w-full rounded-control border border-hairline bg-surface px-2 py-1.5 text-[11.5px] text-text-secondary outline-none"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="shrink-0 gap-1.5"
                onClick={copyReadyLink}
              >
                <Copy className="size-3.5" aria-hidden="true" />
                Copy
              </Button>
            </div>
            <p className="mt-1.5 text-[10.5px] text-ink-faint">
              Send it via WhatsApp, SMS, email or any other channel.
            </p>
          </div>
        )}

        {!hasWhatsapp && (
          <p className="text-[11px] text-status-warning">
            This patient has no WhatsApp number. Use{" "}
            <span className="font-semibold">Copy link</span> to generate a link and send it manually.
          </p>
        )}
      </div>
    </RecordSection>
  );
}
