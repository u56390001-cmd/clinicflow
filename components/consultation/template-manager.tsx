"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTemplateAction, deleteTemplateAction } from "@/lib/actions/consultation";
import type { ActionResult } from "@/types";
import type { PrescriptionTemplate } from "@/types/database";

/**
 * Template manager — save current prescription as template, or load an
 * existing template into the form.
 */
export function TemplateManager({
  doctorId,
  templates,
  onLoad,
}: {
  doctorId: string;
  templates: PrescriptionTemplate[];
  onLoad: (template: PrescriptionTemplate) => void;
}) {
  const router = useRouter();
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const [saveState, saveFormAction, isSaving] = useActionState<
    ActionResult<string> | null,
    FormData
  >(saveTemplateAction, null);

  const [deleteState, deleteFormAction, isDeleting] = useActionState<
    ActionResult<string> | null,
    FormData
  >(deleteTemplateAction, null);

  useEffect(() => {
    if (saveState?.ok) {
      setShowSaveForm(false);
      setTemplateName("");
      router.refresh();
    }
  }, [saveState?.ok, router]);

  useEffect(() => {
    if (deleteState?.ok) {
      router.refresh();
    }
  }, [deleteState?.ok, router]);

  return (
    <div className="space-y-3">
      {/* Load template dropdown */}
      {templates.length > 0 && (
        <div className="space-y-1.5">
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
      )}

      {/* Save as template */}
      {!showSaveForm ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowSaveForm(true)}
          className="text-xs"
        >
          <Bookmark className="mr-1 h-3 w-3" aria-hidden="true" />
          Save as Template
        </Button>
      ) : (
        <form
          action={saveFormAction}
          className="flex items-end gap-2 rounded-control border border-text-muted/30 p-3"
        >
          <input type="hidden" name="doctorId" value={doctorId} />
          {/* medicines and labOrders are passed via hidden fields by the parent */}
          <input type="hidden" name="medicines" id="template-medicines" value="[]" />
          <input type="hidden" name="labOrders" id="template-lab-orders" value="[]" />
          <input type="hidden" name="diagnosis" id="template-diagnosis" value="" />
          <input type="hidden" name="customDiagnosis" id="template-custom-diagnosis" value="" />
          <input type="hidden" name="doctorNotes" id="template-doctor-notes" value="" />

          <div className="flex-1 space-y-1">
            <Label htmlFor="template-name" className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
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
      )}

      {saveState && !saveState.ok && (
        <p className="text-xs text-status-destructive">{saveState.message}</p>
      )}
    </div>
  );
}
