"use client";

/**
 * Presets & Templates — 1-tap regimen loader (built-in protocols first, then
 * this clinic's saved templates from migration 0123) plus "Save Draft as
 * Template". Medicines travel in the legacy chip shape so the clip strings
 * round-trip through `parseLegacyItem` (round-trip covered by tests).
 */

import { useEffect, useState } from "react";
import { Save, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  listDermRxPresetsAction,
  saveDermRxPresetAction,
} from "@/lib/actions/specialty-workspaces";
import type { DermRxPreset } from "@/types/database";

import type { LegacyMedicineEntry } from "../schema/rx-item";
import {
  BUILTIN_PRESETS,
  type LoadablePreset,
  type PresetLabOrder,
} from "./builtin-presets";

export type PresetLoad = {
  medicines: LegacyMedicineEntry[];
  labs: PresetLabOrder[];
  application: string;
  skincareAm: string;
  skincarePm: string;
  education: string;
  followUp: string;
};

/** Everything the current draft contributes to a saved template. */
export type TemplateDraftInput = PresetLoad & { medCount: number };

export function presetToLoad(
  preset: LoadablePreset | DermRxPreset,
): PresetLoad {
  const isBuiltin = "labOrders" in preset;
  const loadable = isBuiltin ? (preset as LoadablePreset) : null;
  const clinic = loadable ? null : (preset as DermRxPreset);
  return {
    medicines: (loadable?.medicines ??
      (clinic?.medicines ?? [])) as LegacyMedicineEntry[],
    labs: loadable?.labOrders ?? (clinic?.lab_orders ?? []),
    application:
      loadable?.application ?? (clinic?.application_instructions ?? ""),
    skincareAm: loadable?.skincareAm ?? (clinic?.skincare_routine_am ?? ""),
    skincarePm: loadable?.skincarePm ?? (clinic?.skincare_routine_pm ?? ""),
    education: loadable?.education ?? (clinic?.patient_education ?? ""),
    followUp: loadable?.followUp ?? (clinic?.follow_up ?? ""),
  };
}

export function PresetsCard({
  canManage,
  onLoad,
  templateDraft,
}: {
  canManage: boolean;
  onLoad: (load: PresetLoad) => void;
  /** Current draft → template payload; null blocks the save button. */
  templateDraft: () => TemplateDraftInput | null;
}) {
  const [open, setOpen] = useState(false);
  const [rxPresets, setRxPresets] = useState<DermRxPreset[]>([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saveTemplatePending, setSaveTemplatePending] = useState(false);

  useEffect(() => {
    void listDermRxPresetsAction().then((result) => {
      if (result.ok) setRxPresets(result.data);
    });
  }, []);

  const saveDraftAsTemplate = async () => {
    const name = templateName.trim();
    if (!name) {
      toast.error("Give the template a name.");
      return;
    }
    const draft = templateDraft();
    if (!draft || draft.medCount === 0) {
      toast.error("Add at least one medicine before saving a template.");
      return;
    }
    setSaveTemplatePending(true);
    const result = await saveDermRxPresetAction({
      name,
      description: `${draft.medCount} medicines, ${draft.labs.length} labs`,
      medicines: draft.medicines,
      lab_orders: draft.labs,
      application_instructions: draft.application || null,
      skincare_routine_am: draft.skincareAm || null,
      skincare_routine_pm: draft.skincarePm || null,
      patient_education: draft.education || null,
      follow_up: draft.followUp || null,
    });
    setSaveTemplatePending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`Template "${name}" saved for this clinic.`);
    setSaveTemplateOpen(false);
    setTemplateName("");
    void listDermRxPresetsAction().then((refresh) => {
      if (refresh.ok) setRxPresets(refresh.data);
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canManage}
        onClick={() => setOpen(true)}
      >
        <Zap className="h-3.5 w-3.5 text-primary" />
        Presets &amp; Templates
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="wide" className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Presets &amp; Templates</DialogTitle>
            <DialogDescription>
              One tap loads a full regimen. Built-in protocols first, then this
              clinic&apos;s saved templates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {BUILTIN_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  onLoad(presetToLoad(preset));
                  setOpen(false);
                }}
                disabled={!canManage}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline p-3 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-text-primary">
                    {preset.name}
                  </p>
                  <p className="text-[11.5px] text-text-muted">
                    {preset.description}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-app px-2 py-0.5 text-[10.5px] font-bold text-text-muted">
                  Built-in · {preset.medicines.length} meds
                  {preset.labOrders.length > 0
                    ? ` · ${preset.labOrders.length} labs`
                    : ""}
                </span>
              </button>
            ))}
            {rxPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onLoad(presetToLoad(preset));
                  setOpen(false);
                }}
                disabled={!canManage}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline p-3 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-text-primary">
                    {preset.name}
                  </p>
                  <p className="text-[11.5px] text-text-muted">
                    {preset.description || "Clinic template"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-bold text-primary">
                  Clinic · {(preset.medicines ?? []).length} meds
                  {(preset.lab_orders ?? []).length > 0
                    ? ` · ${(preset.lab_orders ?? []).length} labs`
                    : ""}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent size="default">
          <DialogHeader>
            <DialogTitle>Save Draft as Template</DialogTitle>
            <DialogDescription>
              Stores the medicines, labs, advice and follow-up of this draft as
              a reusable clinic template.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label
              htmlFor="derm-template-name"
              className="mb-1 block text-[12.5px] font-bold text-text-primary"
            >
              Template name
            </label>
            <Input
              id="derm-template-name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="e.g. Clinic-standard acne regimen"
              maxLength={80}
              className="border-input-border"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSaveTemplateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void saveDraftAsTemplate()}
              disabled={saveTemplatePending || !canManage}
            >
              <Save className="h-3.5 w-3.5" />
              {saveTemplatePending ? "Saving…" : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
