"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTemplateAction, deleteTemplateAction } from "@/lib/actions/consultation";
import type { PrescriptionDraft } from "@/components/patients/record/prescription-draft-context";
import type { ActionResult } from "@/types";
import type { LabOrder, MedicineEntry, PrescriptionTemplate } from "@/types/database";

/**
 * What a saved template captures. Passed as values rather than read off the DOM:
 * the old version left five hidden inputs permanently empty, so every template
 * saved from the prescription form was an empty shell.
 */
export type TemplateValues = Partial<
  Pick<
    PrescriptionDraft,
    "diagnosis" | "customDiagnosis" | "medicines" | "labOrders" | "doctorNotes"
  >
>;

/**
 * "Save as Template" — a button that becomes a one-field form.
 *
 * Lives apart from the picker so the prescription workspace can put it in its
 * sub-header, where the other two end-of-consultation actions are, while
 * `/app/consultation` keeps it above the form.
 */
export function TemplateSaveControl({
  doctorId,
  values,
  disabled = false,
  label = "Save as Template",
  compact = false,
}: {
  doctorId: string | null;
  values?: TemplateValues | null;
  disabled?: boolean;
  label?: string;
  /** Bar-sized: for the prescription workspace's fixed-height action bar. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const [saveState, saveFormAction, isSaving] = useActionState<
    ActionResult<string> | null,
    FormData
  >(saveTemplateAction, null);

  useEffect(() => {
    if (saveState?.ok) {
      setShowSaveForm(false);
      setTemplateName("");
      router.refresh();
    }
  }, [saveState?.ok, router]);

  if (!doctorId) return null;

  if (!showSaveForm) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setShowSaveForm(true)}
        className={compact ? "h-8 border-hairline text-[12px] hover:bg-app" : "border-hairline hover:bg-app"}
      >
        <Bookmark data-icon="inline-start" aria-hidden="true" />
        {label}
      </Button>
    );
  }

  // In a bar the name field sits inline with its buttons: a stacked label
  // inside a 40px row would double the height of the bar it lives in.
  if (compact) {
    return (
      <form action={saveFormAction} className="flex items-center gap-1.5">
        <input type="hidden" name="doctorId" value={doctorId} />
        <input
          type="hidden"
          name="medicines"
          value={JSON.stringify((values?.medicines ?? []) as MedicineEntry[])}
        />
        <input
          type="hidden"
          name="labOrders"
          value={JSON.stringify((values?.labOrders ?? []) as LabOrder[])}
        />
        <input type="hidden" name="diagnosis" value={values?.diagnosis ?? ""} />
        <input
          type="hidden"
          name="customDiagnosis"
          value={values?.customDiagnosis ?? ""}
        />
        <input type="hidden" name="doctorNotes" value={values?.doctorNotes ?? ""} />

        <Input
          id="template-name-bar"
          aria-label="Template name"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder="Template name"
          required
          autoFocus
          className="h-8 w-44 text-[12px]"
        />
        <Button type="submit" size="sm" disabled={isSaving || !templateName.trim()} className="h-8 text-[12px]">
          {isSaving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowSaveForm(false);
            setTemplateName("");
          }}
          className="h-8 text-[12px]"
        >
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <form
      action={saveFormAction}
      className="flex items-end gap-2 rounded-control border border-text-muted/30 p-3"
    >
      <input type="hidden" name="doctorId" value={doctorId} />
      <input
        type="hidden"
        name="medicines"
        value={JSON.stringify((values?.medicines ?? []) as MedicineEntry[])}
      />
      <input
        type="hidden"
        name="labOrders"
        value={JSON.stringify((values?.labOrders ?? []) as LabOrder[])}
      />
      <input type="hidden" name="diagnosis" value={values?.diagnosis ?? ""} />
      <input
        type="hidden"
        name="customDiagnosis"
        value={values?.customDiagnosis ?? ""}
      />
      <input type="hidden" name="doctorNotes" value={values?.doctorNotes ?? ""} />

      <div className="flex flex-1 flex-col gap-1">
        <Label
          htmlFor="template-name"
          className="text-[10px] font-bold uppercase tracking-wider text-text-muted"
        >
          Template Name
        </Label>
        <Input
          id="template-name"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder="e.g. Common Cold Protocol"
          required
        />
      </div>

      <div className="flex gap-1">
        <Button type="submit" size="sm" disabled={isSaving || !templateName.trim()}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowSaveForm(false);
            setTemplateName("");
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The doctor's saved templates, each one a chip that loads it into the form.
 * Renders nothing when there are none — an empty "Load Template" heading is
 * noise on a first visit.
 */
export function TemplatePicker({
  templates,
  onLoad,
}: {
  templates: PrescriptionTemplate[];
  onLoad: (template: PrescriptionTemplate) => void;
}) {
  const [deleteState, deleteFormAction, isDeleting] = useActionState<
    ActionResult<string> | null,
    FormData
  >(deleteTemplateAction, null);

  const router = useRouter();
  useEffect(() => {
    if (deleteState?.ok) {
      router.refresh();
    }
  }, [deleteState?.ok, router]);

  if (templates.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
        Load Template
      </Label>
      <div className="flex flex-wrap gap-2">
        {templates.map((tpl) => (
          <div key={tpl.id} className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onLoad(tpl)}
              className="text-xs"
            >
              <Bookmark className="mr-1 h-3 w-3" aria-hidden="true" />
              {tpl.name}
            </Button>
            <form action={deleteFormAction}>
              <input type="hidden" name="templateId" value={tpl.id} />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-text-muted hover:text-status-destructive"
                disabled={isDeleting}
                aria-label={`Delete template ${tpl.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * "Load Template" as a single control — a menu of this doctor's saved
 * templates.
 *
 * The prescription workspace's action bar is 40px tall and full: a button per
 * template (the old picker) would push Save and Complete off the bar entirely.
 * Loading a template is one choice from a list, so it belongs in a menu, and
 * deleting one belongs in the template manager rather than on the bar a doctor
 * finishes a visit with.
 *
 * It renders even with no templates saved. A control that only exists once you
 * have used it is invisible exactly when a doctor first needs to know it exists,
 * and "no templates yet" inside the menu also says where they come from.
 */
export function TemplateLoadMenu({
  templates,
  onLoad,
}: {
  templates: PrescriptionTemplate[];
  onLoad: (template: PrescriptionTemplate) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-[8px] border-[1.5px] border-primary/30 px-3.5 text-[12.5px] font-semibold text-primary hover:bg-primary/5"
        >
          <Bookmark data-icon="inline-start" aria-hidden="true" />
          Load Template
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {templates.length === 0 ? (
          <div className="px-2.5 py-2 text-[11.5px] leading-relaxed text-text-muted">
            No templates saved yet. Save this prescription as a template from the
            action bar to reuse it.
          </div>
        ) : (
          templates.map((template) => (
            <DropdownMenuItem
              key={template.id}
              onSelect={() => onLoad(template)}
              className="flex flex-col items-start gap-0.5"
            >
              <span className="text-[12.5px] font-semibold text-ink">
                {template.name}
              </span>
              <span className="text-[11px] text-text-muted">
                {[
                  template.diagnosis || template.custom_diagnosis,
                  template.medicines?.length
                    ? `${template.medicines.length} ${
                        template.medicines.length === 1 ? "medicine" : "medicines"
                      }`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Template manager — save current prescription as template, or load an
 * existing template into the form.
 */
export function TemplateManager({
  doctorId,
  templates,
  onLoad,
  values,
  showSave = true,
}: {
  doctorId: string;
  templates: PrescriptionTemplate[];
  onLoad: (template: PrescriptionTemplate) => void;
  /** The live draft, so a saved template carries the medicines actually typed. */
  values?: TemplateValues | null;
  /** False where the save control is rendered elsewhere (the Rx sub-header). */
  showSave?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <TemplatePicker templates={templates} onLoad={onLoad} />
      {showSave && <TemplateSaveControl doctorId={doctorId} values={values} />}
    </div>
  );
}
