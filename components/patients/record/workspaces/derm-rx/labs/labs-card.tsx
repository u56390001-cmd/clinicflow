"use client";

/**
 * Investigations card — order rows with the lab-test combobox, note chips,
 * one-tap lab panels (dedupe), and the clinic custom-test registry. Value is
 * the same `lab_orders` shape saved by both the legacy and new builders.
 */

import { useEffect, useState } from "react";
import { FlaskConical, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  listDermCustomLabTestsAction,
  saveDermCustomLabTestAction,
} from "@/lib/actions/specialty-workspaces";

import { LabTestCombobox } from "./lab-test-combobox";
import {
  LAB_NOTE_CHIPS,
  LAB_PANELS,
  labNoteOn,
  mergePanel,
  toggleLabNote,
  type LabOrderRow,
} from "./lab-data";

export function LabsCard({
  value,
  onChange,
  canManage,
}: {
  value: LabOrderRow[];
  onChange: (next: LabOrderRow[]) => void;
  canManage: boolean;
}) {
  const [customTests, setCustomTests] = useState<string[]>([]);
  const [panelsOpen, setPanelsOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void listDermCustomLabTestsAction().then((result) => {
      if (alive && result.ok) {
        setCustomTests(result.data);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const existingNames = value.map((order) => order.test_name);

  const update = (index: number, field: keyof LabOrderRow, next: string) => {
    onChange(
      value.map((row, i) => (i === index ? { ...row, [field]: next } : row)),
    );
  };

  const addCustomLabTest = async (name: string): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const result = await saveDermCustomLabTestAction({ name: trimmed });
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    setCustomTests((current) =>
      current.some((t) => t.toLowerCase() === trimmed.toLowerCase())
        ? current
        : [...current, trimmed],
    );
    toast.success(`"${trimmed}" saved to the clinic lab registry.`);
    return true;
  };

  const applyPanel = (panel: (typeof LAB_PANELS)[number]) => {
    const { next, added } = mergePanel(value, panel);
    onChange(next);
    if (added === 0) {
      toast.info(`${panel.name} — all tests already on the list.`);
    } else {
      toast.success(`${panel.name}: ${added} test(s) added.`);
      setPanelsOpen(false);
    }
  };

  return (
    <div className="rounded-xl border border-card-line bg-surface">
      <div className="flex items-center justify-between border-b border-card-line px-3.5 py-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <FlaskConical className="h-4 w-4 text-primary" />
          Investigations
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2"
          disabled={!canManage}
          onClick={() => setPanelsOpen(true)}
        >
          Lab Panels
        </Button>
      </div>
      <div className="space-y-2 p-3.5">
        {value.length === 0 ? (
          <p className="text-xs italic text-text-muted/70">
            No investigations ordered yet — add a test below.
          </p>
        ) : (
          value.map((order, index) => (
            <div
              key={index}
              className="rounded-lg border border-card-line p-2.5"
            >
              <div className="grid gap-2 sm:grid-cols-[2fr_2fr_auto]">
                <LabTestCombobox
                  id={`derm-rx-lab-test-${index}`}
                  value={order.test_name}
                  disabled={!canManage}
                  existingNames={existingNames.filter(
                    (name) => name !== order.test_name,
                  )}
                  customTests={customTests}
                  onAddCustom={addCustomLabTest}
                  onChange={(next) => update(index, "test_name", next)}
                />
                <Input
                  id={`derm-rx-lab-notes-${index}`}
                  value={order.notes}
                  disabled={!canManage}
                  onChange={(event) =>
                    update(index, "notes", event.target.value)
                  }
                  placeholder="e.g. Baseline panel"
                  autoComplete="off"
                  className="h-9 border-input-border"
                />
                {canManage ? (
                  <button
                    type="button"
                    onClick={() =>
                      onChange(value.filter((_, i) => i !== index))
                    }
                    aria-label={`Remove investigation ${index + 1}`}
                    className="self-center rounded-md p-1.5 text-text-muted/60 hover:text-status-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span />
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {LAB_NOTE_CHIPS.map((chip) => {
                  const active = labNoteOn(order.notes, chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      aria-pressed={active}
                      disabled={!canManage}
                      onClick={() =>
                        update(
                          index,
                          "notes",
                          toggleLabNote(order.notes, chip),
                        )
                      }
                      className={
                        "rounded-lg border px-2 py-0.5 text-[10.5px] transition-colors " +
                        (active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-hairline text-text-muted hover:text-text-primary")
                      }
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
        {canManage ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onChange([...value, { test_name: "", notes: "" }])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add test
          </Button>
        ) : null}
      </div>

      <Dialog open={panelsOpen} onOpenChange={setPanelsOpen}>
        <DialogContent size="default">
          <DialogHeader>
            <DialogTitle>Lab Panels</DialogTitle>
            <DialogDescription>
              One tap adds the whole panel; tests already ordered are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {LAB_PANELS.map((panel) => (
              <button
                key={panel.name}
                type="button"
                onClick={() => applyPanel(panel)}
                disabled={!canManage}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline p-3 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-text-primary">
                    {panel.name}
                  </p>
                  <p className="truncate text-[11.5px] text-text-muted">
                    {panel.tests.map((t) => t.name).join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-app px-2 py-0.5 text-[10.5px] font-bold text-text-muted">
                  {panel.tests.length} tests
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
