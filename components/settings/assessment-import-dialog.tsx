"use client";

import { useState, useTransition } from "react";
import { Check, Download, ListChecks } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import {
  ASSESSMENT_CATALOG,
  ASSESSMENT_TARGET_SPECIALTY_LABELS,
} from "@/lib/assessment-library";
import { importAssessmentTemplateAction } from "@/lib/actions/assessment-library";
import type { ClinicAssessmentCategory } from "@/types/database";

/**
 * Import a standard instrument from the code-side catalog
 * (lib/assessment-library.ts). Imports are copied into the clinic's library as
 * fully editable, active templates — the clinic keeps its own copy.
 */
export function AssessmentImportDialog({
  open,
  onOpenChange,
  categories,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ClinicAssessmentCategory[];
  onImported: () => void;
}) {
  const [categoryId, setCategoryId] = useState<string>("uncategorised");
  const [importedKeys, setImportedKeys] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(key: string) {
    setPending(key);
    startTransition(async () => {
      const result = await importAssessmentTemplateAction({
        key,
        categoryId:
          categoryId === "uncategorised" || categoryId === ""
            ? null
            : categoryId,
      });
      setPending(null);
      if (result.ok) {
        toast.success("Template imported — edit it any time.");
        setImportedKeys((prev) => new Set(prev).add(key));
        onImported();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setImportedKeys(new Set());
      }}
    >
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>Import from standard instruments</DialogTitle>
          <DialogDescription>
            Copy a research-based instrument into your library, already scored
            with published severity bands. You can edit anything after the
            import.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-1 flex flex-col gap-1.5">
          <Label htmlFor="import-category">File into category</Label>
          <NativeSelect
            id="import-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="max-w-xs"
          >
            <option value="uncategorised">Uncategorised</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <ul className="flex flex-col gap-2 overflow-y-auto pr-1">
          {ASSESSMENT_CATALOG.map((entry) => {
            const done = importedKeys.has(entry.key);
            const busy = pending === entry.key;
            return (
              <li
                key={entry.key}
                className="flex flex-col gap-2 rounded-card border border-hairline bg-app p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[13px] font-bold text-text-primary">
                      {entry.key}
                    </p>
                    <span className="text-[11.5px] text-ink-faint">
                      {entry.name}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{entry.category}</Badge>
                    <Badge variant="outline">
                      {ASSESSMENT_TARGET_SPECIALTY_LABELS[entry.targetSpecialty]}
                    </Badge>
                    {entry.questions.length > 0 ? (
                      <Badge variant="outline">
                        {entry.questions.length} questions
                      </Badge>
                    ) : (
                      <Badge variant="outline">Manual score</Badge>
                    )}
                    <Badge variant="outline">
                      {entry.scoring.bands.length} severity bands
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={done || busy || isPending}
                  onClick={() => run(entry.key)}
                  className="shrink-0 gap-1.5"
                >
                  {done ? (
                    <Check className="size-3.5 text-status-success" aria-hidden="true" />
                  ) : (
                    <Download className="size-3.5" aria-hidden="true" />
                  )}
                  {done ? "Imported" : busy ? "Importing…" : "Import"}
                </Button>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="gap-2">
          <p className="mr-auto flex items-center gap-1.5 text-[11.5px] text-ink-faint">
            <ListChecks className="size-3.5" aria-hidden="true" />
            Imports create editable copies owned by your clinic.
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}