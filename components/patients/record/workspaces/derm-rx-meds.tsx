"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save } from "lucide-react";

import { LabOrderEntry } from "@/components/consultation/lab-order-entry";
import { MedicineEntry } from "@/components/consultation/medicine-entry";
import { RxSafetyPanel } from "@/components/consultation/rx-safety-panel";
import { RecordSection } from "@/components/patients/record/record-primitives";
import { Button } from "@/components/ui/button";
import { saveDermRxAction } from "@/lib/actions/specialty-workspaces";
import type {
  LabOrder,
  MedicineEntry as MedicineEntryType,
} from "@/types/database";

/** A medicine whose frequency names a time of day lands in that AM/PM list. */
function routineSteps(
  medicines: MedicineEntryType[],
  period: "am" | "pm",
): string[] {
  const pattern = period === "am" ? /\bam\b|morning/i : /\bpm\b|night|evening/i;
  return medicines
    .filter((medicine) => pattern.test(medicine.frequency))
    .map((medicine) => {
      const parts = [medicine.name.trim()];
      if (medicine.frequency.trim()) parts.push(medicine.frequency.trim());
      if (medicine.instructions.trim())
        parts.push(medicine.instructions.trim());
      return parts.join(" — ");
    })
    .filter((line) => line.length > 0);
}

/**
 * Dermatology medicines, investigations, the safety checks and the
 * patient-facing AM/PM routine.
 *
 * The medicine and lab rows are the very components the General Physician
 * prescription uses (`MedicineEntry`, `LabOrderEntry`), so the derm flow shares
 * one editing experience instead of a second prescription engine — the safety
 * panel is the GP builder's panel too. The routine preview and the safety
 * checks share column 3 (spec §8.4); the routine is derived live from the
 * current draft, and so are the warnings.
 */
export function DermRxMeds({
  patientId,
  prescriptionId,
  medicines,
  labOrders,
  skincareAm,
  skincarePm,
  allergies,
  canManage,
  visitId,
}: {
  patientId: string;
  prescriptionId: string | null;
  medicines: MedicineEntryType[];
  labOrders: LabOrder[];
  skincareAm: string | null;
  skincarePm: string | null;
  /** Recorded allergy strings (patient + derm profile), for the safety panel. */
  allergies?: Array<string | null | undefined>;
  canManage: boolean;
  /** Active visit/encounter stamp for a fresh prescription — migration 0104. */
  visitId?: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<MedicineEntryType[]>(medicines);
  const [labs, setLabs] = useState<LabOrder[]>(labOrders);

  function updateMedicine(
    index: number,
    field: keyof MedicineEntryType,
    value: string,
  ) {
    setItems((current) =>
      current.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    );
  }

  function addMedicine() {
    setItems((current) => [
      ...current,
      {
        name: "",
        route: "",
        form: "",
        frequency: "",
        duration: "",
        unit: "",
        instructions: "",
      },
    ]);
  }

  function removeMedicine(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  function updateLab(index: number, field: keyof LabOrder, value: string) {
    setLabs((current) =>
      current.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    );
  }

  function addLab() {
    setLabs((current) => [...current, { test_name: "", notes: "" }]);
  }

  function removeLab(index: number) {
    setLabs((current) => current.filter((_, i) => i !== index));
  }

  async function save() {
    if (!canManage) return;
    setSaving(true);
    const result = await saveDermRxAction(
      patientId,
      {
        id: prescriptionId,
        medicines: items.filter(
          (medicine) =>
            medicine.name.trim() ||
            medicine.route.trim() ||
            medicine.frequency.trim() ||
            medicine.instructions.trim(),
        ),
        lab_orders: labs.filter(
          (order) => order.test_name.trim() || order.notes.trim(),
        ),
      },
      visitId,
    );
    setSaving(false);
    if (result.ok) {
      toast.success("Medicines & investigations saved");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  const am = routineSteps(items, "am");
  const pm = routineSteps(items, "pm");

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <RecordSection
        title="Medicines"
        className="xl:col-span-2"
        meta={items.length > 0 ? `${items.length} item(s)` : "None yet"}
      >
        {items.length === 0 ? (
          <p className="text-[13px] text-text-muted">
            No medicines added yet. Add one row per oral or topical medicine.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((medicine, index) => (
              <MedicineEntry
                key={index}
                index={index}
                medicine={medicine}
                canRemove={canManage}
                onChange={updateMedicine}
                onRemove={removeMedicine}
              />
            ))}
          </div>
        )}
        {canManage && (
          <div className="mt-3 flex justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addMedicine}
              className="gap-1.5"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Add medicine
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={saving}
              className="gap-1.5"
            >
              <Save aria-hidden="true" className="size-3.5" />
              {saving ? "Saving…" : "Save medicines & labs"}
            </Button>
          </div>
        )}
      </RecordSection>

      {/* Column 3 (spec §8.4): the patient-facing AM/PM routine on top, the
          safety panel under it — both recomputed live from the draft rows at
          the left. Advisory only: warnings never gate the save. */}
      <div className="flex min-w-0 flex-col gap-3">
        <RecordSection
          title="Patient AM/PM routine"
          meta="From the current draft"
        >
          <div className="space-y-3">
            <div>
              <p className="text-ink mb-1 text-[12px] font-bold uppercase tracking-wide">
                Morning
              </p>
              <ol className="list-decimal space-y-0.5 pl-5 text-[13px] text-text-secondary">
                {skincareAm && <li>{skincareAm}</li>}
                {am.map((line, index) => (
                  <li key={`am-${index}`}>{line}</li>
                ))}
                {!skincareAm && am.length === 0 && (
                  <li className="list-none text-text-muted">
                    Nothing scheduled for the morning.
                  </li>
                )}
              </ol>
            </div>
            <div>
              <p className="text-ink mb-1 text-[12px] font-bold uppercase tracking-wide">
                Night
              </p>
              <ol className="list-decimal space-y-0.5 pl-5 text-[13px] text-text-secondary">
                {skincarePm && <li>{skincarePm}</li>}
                {pm.map((line, index) => (
                  <li key={`pm-${index}`}>{line}</li>
                ))}
                {!skincarePm && pm.length === 0 && (
                  <li className="list-none text-text-muted">
                    Nothing scheduled for the night.
                  </li>
                )}
              </ol>
            </div>
            <p className="text-[11px] leading-relaxed text-text-muted">
              Medicines appear here when their frequency names a time of day
              (AM/PM, morning/night); the skincare routine lines come from the
              fields below. Per-medicine AM/PM scheduling beyond that follows
              the shared prescription model, which stores one frequency per
              medicine.
            </p>
          </div>
        </RecordSection>

        <RecordSection title="Safety & interaction checks" meta="Live draft">
          <RxSafetyPanel medicines={items} allergies={allergies} />
        </RecordSection>
      </div>

      <RecordSection title="Investigations & labs" className="xl:col-span-3">
        {labs.length === 0 ? (
          <p className="text-[13px] text-text-muted">
            No investigations ordered yet.
          </p>
        ) : (
          <div className="space-y-2">
            {labs.map((order, index) => (
              <LabOrderEntry
                key={index}
                index={index}
                order={order}
                canRemove={canManage}
                onChange={updateLab}
                onRemove={removeLab}
              />
            ))}
          </div>
        )}
        {canManage && (
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLab}
              className="gap-1.5"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Add investigation
            </Button>
          </div>
        )}
      </RecordSection>
    </div>
  );
}
