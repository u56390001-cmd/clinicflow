"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Edit,
  FileDown,
  FileUp,
  Plus,
  Search,
  X,
} from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createMedicineAction,
  getMedicinesAction,
  importMedicinesAction,
  setMedicineActiveAction,
  updateMedicineAction,
  type ImportSummary,
  type MedicineListItem,
  type MedicinesPage,
} from "@/lib/actions/medicines";
import { downloadMedicineImportTemplate } from "@/lib/medicine-csv";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";

type Mode = "list" | "create" | "edit";

type EditFormState = {
  id: string;
  name: string;
  strength: string;
  category: string;
  isActive: boolean;
};

const DEFAULT_EDIT: EditFormState = {
  id: "",
  name: "",
  strength: "",
  category: "",
  isActive: true,
};

export function ManageMedicinesDialog({
  open,
  onOpenChange,
  canWrite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
}) {
  const [mode, setMode] = useState<Mode>("list");
  const [edit, setEdit] = useState<EditFormState>(DEFAULT_EDIT);

  const [filter, setFilter] = useState<"active" | "inactive" | "all">("active");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MedicinesPage | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  const load = () => {
    setLoading(true);
    setError(null);
    startTransition(async () => {
      const result = await getMedicinesAction({
        filter,
        search: debouncedSearch,
        page,
      });
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setData(null);
        setError(result.message);
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    if (!open) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter, debouncedSearch, page]);

  useEffect(() => {
    if (!open) {
      setMode("list");
      setEdit(DEFAULT_EDIT);
      setSearch("");
      setDebouncedSearch("");
      setPage(1);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="wide"
        showCloseButton={false}
        // The list view drops the content padding so its brand bar runs edge to
        // edge and paints its own insets; the add/edit forms keep the default
        // padding every other dialog in the app has.
        className={
          mode === "list"
            ? "max-h-[88vh] gap-0 rounded-card p-0"
            : "rounded-card"
        }
      >
        {mode === "list" && (
          <>
            {/* Solid brand bar. `p-0`/`gap-0` on the content plus this bar's own
                padding is what lets the colour run edge to edge while the toolbar,
                list and footer below it keep their inset. The reference's indigo
                (#4E5DB5) is this project's `primary` token. */}
            <div className="flex shrink-0 items-center justify-between bg-primary px-6 py-4">
              <DialogHeader className="pr-0">
                <DialogTitle className="text-base font-semibold text-white">
                  Manage Medicines
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/80">
                  {data ? `${data.total} medicines in your clinic list` : "…"}
                </DialogDescription>
              </DialogHeader>

              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-white hover:bg-white/20 hover:text-white"
                >
                  <X aria-hidden="true" />
                  <span className="sr-only">Close</span>
                </Button>
              </DialogClose>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-hairline-soft px-6 py-3">
              <div className="relative min-w-[200px] flex-1">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search medicines..."
                  className="pl-9"
                  aria-label="Search medicines"
                />
              </div>

              <NativeSelect
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value as typeof filter);
                  setPage(1);
                }}
                className="w-auto"
                aria-label="Filter medicines"
              >
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
                <option value="all">All medicines</option>
              </NativeSelect>

              <ImportButton onImported={() => load()} />

              <Button
                type="button"
                size="sm"
                className="text-xs font-semibold"
                onClick={() => {
                  setEdit(DEFAULT_EDIT);
                  setMode("create");
                }}
                disabled={!canWrite}
              >
                <Plus data-icon="inline-start" aria-hidden="true" />
                Add Medicine
              </Button>
            </div>

            {error && (
              <div className="px-6 pt-3">
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </div>
            )}

            <div className="min-h-[380px] flex-1 overflow-y-auto px-6 py-3">
              {loading || isPending ? (
                <ListSkeleton />
              ) : !data || data.items.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="No medicines"
                  description={
                    debouncedSearch || filter !== "active"
                      ? "No medicines match that search."
                      : "Your clinic has no medicines in the list yet."
                  }
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {data.items.map((item) => (
                    <MedicineRow
                      key={item.id}
                      item={item}
                      canWrite={canWrite}
                      onEdit={() => {
                        setEdit({
                          id: item.id,
                          name: item.name,
                          strength: item.strength,
                          category: item.category,
                          isActive: item.isActive,
                        });
                        setMode("edit");
                      }}
                      onToggle={(active) =>
                        startTransition(async () => {
                          await setMedicineActiveAction(item.id, active);
                          load();
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            {data && data.pageCount > 0 && (
              <div className="flex shrink-0 items-center justify-between border-t border-hairline-soft px-6 py-3">
                <p className="text-xs text-text-muted">
                  Page {data.page} of {data.pageCount}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={data.page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={data.page >= data.pageCount || loading}
                    onClick={() =>
                      setPage((p) => Math.min(data.pageCount, p + 1))
                    }
                  >
                    Next →
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {mode === "create" && (
          <MedicineForm
            title="Add Medicine"
            initial={DEFAULT_EDIT}
            canWrite={canWrite}
            action={createMedicineAction}
            onCancel={() => setMode("list")}
            onSaved={() => {
              setMode("list");
              load();
            }}
          />
        )}

        {mode === "edit" && (
          <MedicineForm
            title="Edit Medicine"
            initial={edit}
            canWrite={canWrite}
            action={updateMedicineAction}
            includeId
            onCancel={() => setMode("list")}
            onSaved={() => {
              setMode("list");
              load();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const MEDICINES_PAGE_SIZE = 15;

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: MEDICINES_PAGE_SIZE }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-control border border-hairline bg-surface p-3"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2 w-1/3" />
          </div>
          <Skeleton className="h-5 w-14" />
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
        </div>
      ))}
    </div>
  );
}

function MedicineRow({
  item,
  canWrite,
  onEdit,
  onToggle,
}: {
  item: MedicineListItem;
  canWrite: boolean;
  onEdit: () => void;
  onToggle: (active: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-control border border-hairline bg-surface p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">
          {item.name}
          {item.strength && (
            <span className="ml-1 font-normal text-text-muted">
              · {item.strength}
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-xs text-text-muted">
          {item.category || "—"}
        </p>
      </div>

      <Badge
        variant={item.isActive ? "success" : "outline"}
        className="flex-shrink-0 font-semibold"
      >
        {item.isActive ? "Active" : "Inactive"}
      </Badge>

      <div className="flex flex-shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8 text-primary"
          onClick={onEdit}
          disabled={!canWrite}
          title="Edit"
        >
          <Edit aria-hidden="true" />
          <span className="sr-only">Edit</span>
        </Button>
        {/* Tinted outline rather than solid: the reference's deactivate control is
            a bordered red X, and a filled square of `status-destructive` on every
            row reads louder than the list it sits in. */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            "size-8",
            item.isActive
              ? "border-status-destructive/30 text-status-destructive hover:bg-status-destructive/10"
              : "border-primary/30 text-primary hover:bg-primary/10",
          )}
          onClick={() => onToggle(!item.isActive)}
          disabled={!canWrite}
          title={item.isActive ? "Deactivate" : "Activate"}
        >
          {item.isActive ? (
            <X aria-hidden="true" />
          ) : (
            <Check aria-hidden="true" />
          )}
          <span className="sr-only">
            {item.isActive ? "Deactivate" : "Activate"}
          </span>
        </Button>
      </div>
    </div>
  );
}

function MedicineForm({
  title,
  initial,
  action,
  includeId,
  canWrite,
  onCancel,
  onSaved,
}: {
  title: string;
  initial: EditFormState;
  action: (
    _prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  includeId?: boolean;
  canWrite: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    action,
    null,
  );

  const [name, setName] = useState(initial.name);
  const [strength, setStrength] = useState(initial.strength);
  const [category, setCategory] = useState(initial.category);
  const [isActive, setIsActive] = useState(initial.isActive);

  const submitted = state !== null;

  useEffect(() => {
    if (state?.ok) onSaved();
  }, [state, onSaved]);

  const errors =
    submitted && state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>

      {submitted && !state.ok && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {includeId && <input type="hidden" name="id" value={initial.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="medicine-name">Name</Label>
        <Input
          id="medicine-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Paracetamol"
          disabled={!canWrite}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="-mt-0.5 text-xs font-medium text-status-destructive">
            {errors.name}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="medicine-strength">Strength</Label>
          <Input
            id="medicine-strength"
            name="strength"
            value={strength}
            onChange={(e) => setStrength(e.target.value)}
            placeholder="e.g. 500mg"
            disabled={!canWrite}
            aria-invalid={!!errors.strength}
          />
          {errors.strength && (
            <p className="-mt-0.5 text-xs font-medium text-status-destructive">
              {errors.strength}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="medicine-category">Category</Label>
          <Input
            id="medicine-category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Tablet"
            disabled={!canWrite}
            aria-invalid={!!errors.category}
          />
          {errors.category && (
            <p className="-mt-0.5 text-xs font-medium text-status-destructive">
              {errors.category}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-control border border-hairline bg-app/40 p-3">
        <div>
          <p className="text-sm font-medium text-text-primary">Active</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Active medicines appear in the prescription dropdown.
          </p>
        </div>
        <input
          type="hidden"
          name="isActive"
          value={isActive ? "true" : "false"}
        />
        <Button
          type="button"
          variant={isActive ? "primary" : "outline"}
          size="sm"
          onClick={() => setIsActive((v) => !v)}
          disabled={!canWrite}
        >
          {isActive ? "Active" : "Inactive"}
        </Button>
      </div>

      <DialogFooter className="gap-2 sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton loadingText="Saving…" disabled={!canWrite}>
          Save
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}

function ImportButton({ onImported }: { onImported: () => void }) {
  const [importState, importAction] = useActionState<
    ActionResult<ImportSummary> | null,
    FormData
  >(importMedicinesAction, null);
  const [importOpen, setImportOpen] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>("");

  useEffect(() => {
    if (importState?.ok) {
      setSummary(importState.data);
      onImported();
    }
  }, [importState, onImported]);

  useEffect(() => {
    if (!importOpen) {
      setSummary(null);
      setSelectedFile("");
    }
  }, [importOpen]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-primary/30 text-xs font-semibold text-primary hover:bg-primary/10"
        onClick={() => setImportOpen(true)}
      >
        <FileUp data-icon="inline-start" aria-hidden="true" />
        Import Excel/CSV
      </Button>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent size="wide">
          <DialogHeader>
            <DialogTitle>Import Medicines</DialogTitle>
          </DialogHeader>

          {importState && !importState.ok && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{importState.message}</AlertDescription>
            </Alert>
          )}

          {summary && (
            <Alert variant="success">
              <CheckCircle2 aria-hidden="true" />
              <AlertDescription>
                Imported {summary.added}{" "}
                {summary.added === 1 ? "medicine" : "medicines"}
                {summary.duplicates > 0
                  ? ` • ${summary.duplicates} already present`
                  : ""}
                {summary.skipped.length > 0
                  ? ` • ${summary.skipped.length} skipped`
                  : ""}
                .
              </AlertDescription>
            </Alert>
          )}

          {summary && summary.skipped.length > 0 && (
            <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-control border border-hairline bg-app/40 p-3 text-xs">
              {summary.skipped.map((sk, i) => (
                <p key={i} className="text-text-muted">
                  Line {sk.line}: {sk.reason}
                </p>
              ))}
            </div>
          )}

          <form action={importAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="medicine-file">CSV file</Label>
              <Input
                id="medicine-file"
                name="file"
                type="file"
                accept=".csv,.tsv,text/csv"
                onChange={(e) =>
                  setSelectedFile(e.target.files?.[0]?.name ?? "")
                }
              />
              <p className="text-xs text-text-muted">
                Column names: Name, Strength, Category, Active. Template
                includes a sample row.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadMedicineImportTemplate()}
              >
                <FileDown data-icon="inline-start" aria-hidden="true" />
                Download Template
              </Button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setImportOpen(false)}
                >
                  Close
                </Button>
                <SubmitButton loadingText="Importing…" disabled={!selectedFile}>
                  Import
                </SubmitButton>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
