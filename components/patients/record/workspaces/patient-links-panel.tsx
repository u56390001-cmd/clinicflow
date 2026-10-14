"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ClipboardList, FileUp, Loader2 } from "lucide-react";

import { RecordSection } from "@/components/patients/record/record-primitives";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import {
  sendPsychAssessmentLinkAction,
  sendPsychDocumentUploadLinkAction,
  sendPsychPreVisitLinkAction,
} from "@/lib/actions/patient-links";
import { PSYCHOMETRIC_INSTRUMENTS, PSYCHOMETRIC_KEYS } from "@/lib/psychometrics";
import { listInstruments } from "@/lib/scoring";
import type { AssessmentTemplate } from "@/types/database";

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
 * assessment, document upload) through the clinic's existing WhatsApp channel.
 * The link is also copied to the clipboard as a fallback. The panel appears on
 * the psychology Safety tab only.
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
  const [pending, setPending] = useState<Kind | null>(null);
  const [assessmentType, setAssessmentType] = useState<string>(PSYCHOMETRIC_KEYS[0]);
  const hasWhatsapp = (whatsappNumber ?? "").replace(/[^\d]/g, "").length > 0;
  const disabled = !canManage || pending !== null || !hasWhatsapp;

  async function send(kind: Kind) {
    if (disabled) return;
    setPending(kind);
    let result;
    if (kind === "assessment") {
      if (assessmentType.startsWith(TEMPLATE_PREFIX)) {
        const id = assessmentType.slice(TEMPLATE_PREFIX.length);
        const template = templates.find((t) => t.id === id);
        result = template
          ? await sendPsychAssessmentLinkAction(patientId, template.name, template.id)
          : { ok: false as const, message: "That assessment is no longer available." };
      } else {
        result = await sendPsychAssessmentLinkAction(patientId, assessmentType);
      }
    } else {
      result =
        kind === "pre_visit"
          ? await sendPsychPreVisitLinkAction(patientId)
          : await sendPsychDocumentUploadLinkAction(patientId);
    }
    setPending(null);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const url = `${window.location.origin}${result.data.path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may be unavailable — the WhatsApp message still carries the link */
    }
    if (result.data.whatsappSent) {
      toast.success("Link sent on WhatsApp · copied to clipboard");
    } else {
      toast("Link created · copied to clipboard", {
        description: "WhatsApp isn't connected for this clinic, so send it manually.",
      });
    }
  }

  return (
    <RecordSection title="Send patient links">
      <div className="space-y-3">
        <p className="text-[12px] leading-relaxed text-text-secondary">
          Send a secure form over WhatsApp. Answers appear in this record
          automatically.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => send("pre_visit")}
          >
            {pending === "pre_visit" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ClipboardList className="size-4" />
            )}
            Pre-visit form
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => send("document_upload")}
          >
            {pending === "document_upload" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileUp className="size-4" />
            )}
            Upload documents
          </Button>
        </div>

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
              disabled={disabled}
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
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => send("assessment")}
          >
            {pending === "assessment" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ClipboardList className="size-4" />
            )}
            Send assessment
          </Button>
        </div>

        {!hasWhatsapp && (
          <p className="text-[11px] text-status-warning">
            This patient has no WhatsApp number. Add one to send links.
          </p>
        )}
      </div>
    </RecordSection>
  );
}
