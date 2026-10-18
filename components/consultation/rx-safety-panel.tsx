"use client";

import { useMemo } from "react";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { evaluateRxSafety } from "@/lib/prescription-safety";
import { useInteractionRules } from "@/lib/rx-reference";
import { cn } from "@/lib/utils";
import type { MedicineEntry } from "@/types/database";

/**
 * The prescription safety area (dermatology spec §8.4): allergy conflicts
 * from the patient's own recorded allergies plus drug-drug interactions from
 * the clinic-governed `drug_interaction_rules` table, recomputed live against
 * the draft on every keystroke.
 *
 * Body-only on purpose — each surface wraps it in its own card language
 * (a `RecordSection` on the derm tab, an `RxCard` in the GP builder, a
 * labelled block on the consultation form), and the title stays the callers'
 * ("Safety & interaction checks"). Advisory by design: warnings never block
 * a save; prescribing stays the clinician's decision, and the footnote says
 * exactly what was checked.
 */
export function RxSafetyPanel({
  medicines,
  allergies,
  className,
}: {
  medicines: MedicineEntry[];
  /** Raw recorded allergy strings (nullish entries ignored). */
  allergies?: Array<string | null | undefined>;
  className?: string;
}) {
  const rules = useInteractionRules();

  const warnings = useMemo(
    () =>
      rules === null
        ? null
        : evaluateRxSafety({
            medicines,
            allergySources: allergies ?? [],
            rules,
          }),
    [medicines, allergies, rules],
  );

  if (warnings === null) {
    return (
      <p
        className={cn(
          "flex items-center gap-2 text-[12px] text-text-muted",
          className,
        )}
      >
        <ShieldQuestion aria-hidden="true" className="size-3.5 shrink-0" />
        Running safety checks…
      </p>
    );
  }

  if (warnings.length === 0) {
    return (
      <p
        className={cn(
          "flex items-center gap-2 text-[12px] text-status-success",
          className,
        )}
      >
        <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
        No allergy or interaction warnings for this draft.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ul className="flex flex-col gap-2">
        {warnings.map((warning) => {
          const severe = warning.severity === "major";
          return (
            <li
              key={warning.key}
              className={cn(
                "flex items-start gap-2.5 rounded-[8px] border p-2.5",
                severe
                  ? "border-status-destructive/30 bg-status-destructive/5"
                  : "border-status-warning/30 bg-status-warning/5",
              )}
            >
              <ShieldAlert
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  severe ? "text-status-destructive" : "text-status-warning",
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant={severe ? "destructive" : "warning"}
                    className="text-[9px] font-bold uppercase tracking-wider"
                  >
                    {warning.kind === "allergy" ? "Allergy" : warning.severity}
                  </Badge>
                  <span className="truncate text-[10px] font-medium text-text-muted">
                    {warning.medicines.join(" + ")}
                  </span>
                </div>
                <p className="text-ink text-[12px] leading-snug">
                  {warning.message}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] leading-relaxed text-text-muted">
        Checked against this patient&apos;s recorded allergies and the
        clinic&apos;s interaction rule list. Warnings are advisory — verify and
        prescribe at clinical discretion.
      </p>
    </div>
  );
}
