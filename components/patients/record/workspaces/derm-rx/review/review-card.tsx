"use client";

/**
 * Review & Approve card — the Approve & Lock step. Shows the approval
 * checklist (medicines exist, safety blocks resolved), the draft language
 * used for print/share, and — once locked — the version stamp with the
 * Unlock action (new version row, server refuses in-place edits).
 */

import { useState } from "react";
import { Check, Lock, LockOpen, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  approveDermRxAction,
  unlockDermRxAction,
  saveDermRxAction,
} from "@/lib/actions/specialty-workspaces";

import { RX_LOCALES, type RxLocale } from "../render/i18n";
import { buildRxViewModel, documentToShareText } from "../render/view-model";
import type { SafetyFinding } from "../safety/rules";
import type { RxItem } from "../schema/rx-item";
import type { DraftPayload } from "../state/use-rx-draft";

export type ReviewCardProps = {
  patientId: string;
  /** null = nothing saved yet (approve disabled). */
  prescriptionId: string | null;
  /** Current snapshot of the draft going into the lock. */
  items: RxItem[];
  payloadForLock: (envelope: RxItem[]) => DraftPayload;
  status?: string | null;
  version?: number | null;
  findings: SafetyFinding[];
  canManage: boolean;
  /** Parent refetch after approve/unlock. */
  onChanged: (newPrescriptionId: string | null) => void;
};

export function ReviewCard({
  patientId,
  prescriptionId,
  items,
  payloadForLock,
  status,
  version,
  findings,
  canManage,
  onChanged,
}: ReviewCardProps) {
  const [locale, setLocale] = useState<RxLocale>("roman");
  const [pending, setPending] = useState(false);
  const blocks = findings.filter((f) => f.severity === "block");
  const warns = findings.filter((f) => f.severity === "warn");
  const isFinal = status === "final";

  const checklist: { ok: boolean; message: string }[] = [
    {
      ok: items.length > 0,
      message: "Kam az kam 1 dawa likhi jay",
    },
    {
      ok: blocks.length === 0,
      message: blocks.length > 0
        ? `${blocks.length} BLOCK findings not resolved`
        : "Safety blocks clear nahi hain",
    },
  ];
  const canApprove =
    canManage && !isFinal && prescriptionId !== null && checklist.every((c) => c.ok);

  const finalizeDraft = async (): Promise<DraftPayload | null> => {
    // Persist the current draft first so the locked snapshot never diverges
    // from what the doctor sees.
    const payload = payloadForLock(items);
    const result = await saveDermRxAction(
      patientId,
      { id: prescriptionId ?? undefined, ...payload },
      null,
    );
    if (!result.ok) {
      toast.error(result.message);
      return null;
    }
    return payload;
  };

  const approve = async () => {
    if (!prescriptionId) return;
    setPending(true);
    const saved = await finalizeDraft();
    if (!saved) {
      setPending(false);
      return;
    }
    const result = await approveDermRxAction(patientId, {
      rx_id: prescriptionId,
      snapshot: {
        medicines: { schema_version: 2 as const, items: saved.items },
        application_instructions: saved.application_instructions,
        skincare_routine_am: saved.skincare_routine_am,
        skincare_routine_pm: saved.skincare_routine_pm,
        patient_education: saved.patient_education,
        follow_up: saved.follow_up,
        lab_orders: saved.lab_orders,
      },
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`Rx approved & locked (v${version ?? 1}).`);
    onChanged(prescriptionId);
  };

  const unlock = async () => {
    if (!prescriptionId) return;
    setPending(true);
    const result = await unlockDermRxAction(patientId, {
      id: prescriptionId,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`Nayi version ban gayi — row #${result.data} ab edit kar sakte hain.`);
    onChanged(result.data as string);
  };

  const previewShare = () => {
    const doc = buildRxViewModel({
      locale,
      items,
      patient: { name: "" },
      clinician: "",
    });
    const text = documentToShareText(doc);
    void navigator.clipboard?.writeText(text);
    toast.info(
      "Print/share text copy ho gayi (A4 sheet preview Phase 6 cutover par).",
    );
  };

  return (
    <div className="rounded-xl border border-card-line bg-surface">
      <div className="flex items-center justify-between border-b border-card-line px-3.5 py-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <Lock className="h-4 w-4 text-primary" />
          Review &amp; approve
        </p>
        <span className="flex gap-1.5">
          {isFinal ? (
            <span className="rounded bg-[#3c6e3a] px-2 py-0.5 text-[10.5px] font-bold uppercase text-white">
              Locked · v{version ?? 1}
            </span>
          ) : (
            <span className="rounded bg-chip px-2 py-0.5 text-[10.5px] font-bold uppercase text-text-muted">
              Draft
            </span>
          )}
        </span>
      </div>
      <div className="space-y-3 p-3.5">
        {!isFinal ? (
          <ul className="space-y-1">
            {checklist.map((check) => (
              <li
                key={check.message}
                className="flex items-center gap-2 text-xs"
              >
                <span
                  className={
                    "flex size-4 items-center justify-center rounded-full " +
                    (check.ok
                      ? "bg-status-success/15 text-status-success"
                      : "bg-[#f0c9c1] text-[#a33b2a]")
                  }
                >
                  <Check className="h-2.5 w-2.5" />
                </span>
                <span className={check.ok ? "text-text-muted" : "text-[#a33b2a]"}>
                  {check.message}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-muted">
            Rx frozen snapshot par approved hai — koi inline edit possible
            nahi. Unlock karne par version+1 naya draft banayega; purana final
            history me intact rehta hai.
          </p>
        )}

        {warns.length > 0 ? (
          <p className="text-xs text-[#8a6d1f]">
            {warns.length} warn finding present hain — approve se pehle review
            karen (safety panel me dikh rahe hain).
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
            Print language
          </span>
          {RX_LOCALES.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={locale === option.key}
              onClick={() => setLocale(option.key)}
              className={
                "rounded-lg border px-2 py-1 text-[11px] transition-colors " +
                (locale === option.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-hairline text-text-muted hover:text-text-primary")
              }
            >
              {option.ui}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {isFinal ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !canManage}
              onClick={unlock}
            >
              <LockOpen className="h-3.5 w-3.5" />
              Unlock (new version)
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                disabled={!canApprove || pending}
                onClick={approve}
              >
                <Lock className="h-3.5 w-3.5" />
                Approve &amp; lock
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={items.length === 0}
                onClick={previewShare}
              >
                <Printer className="h-3.5 w-3.5" />
                Preview share text
              </Button>
            </>
          )}
        </div>
        {!prescriptionId ? (
          <p className="text-[11px] italic text-text-muted/70">
            Pehle save ho jayen — autosave ho gaya hai ya kisi medicine add
            kar ke save hote hi Approve activate ho jaye ga.
          </p>
        ) : null}
      </div>
    </div>
  );
}
