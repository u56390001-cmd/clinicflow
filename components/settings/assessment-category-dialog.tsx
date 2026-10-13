"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Inbox } from "lucide-react";
import {
  deleteAssessmentCategoryAction,
  saveAssessmentCategoryAction,
  setAssessmentCategoryActiveAction,
} from "@/lib/actions/assessment-library";
import type { ClinicAssessmentCategory } from "@/types/database";

function CategoryRow({
  category,
  onChanged,
}: {
  category: ClinicAssessmentCategory;
  onChanged: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [isPending, startTransition] = useTransition();

  function saveRename() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Category name is required.");
      return;
    }
    if (trimmed === category.name) {
      setEditing(false);
      return;
    }
    setPending(true);
    startTransition(async () => {
      const result = await saveAssessmentCategoryAction({
        id: category.id,
        name: trimmed,
        isActive: category.is_active,
      });
      setPending(false);
      if (result.ok) {
        toast.success("Category renamed.");
        setEditing(false);
        onChanged();
      } else {
        toast.error(result.message);
      }
    });
  }

  function toggleActive() {
    startTransition(async () => {
      const result = await setAssessmentCategoryActiveAction(
        category.id,
        !category.is_active,
      );
      if (result.ok) {
        toast.success(category.is_active ? "Category hidden." : "Category visible.");
        onChanged();
      } else {
        toast.error(result.message);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteAssessmentCategoryAction(category.id);
      if (result.ok) {
        toast.success("Category deleted — its templates are now uncategorised.");
        onChanged();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <li className="flex items-center gap-2 rounded-card border border-hairline bg-app px-3 py-2.5">
      {editing ? (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveRename();
            if (e.key === "Escape") {
              setName(category.name);
              setEditing(false);
            }
          }}
          aria-label="Category name"
          className="h-8 flex-1"
        />
      ) : (
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-primary">
          {category.name}
        </p>
      )}

      <span className="flex items-center gap-1 text-[11.5px] font-medium text-ink-faint">
        <label className="flex cursor-pointer items-center gap-1.5" htmlFor={`cat-${category.id}`}>
          <span className="hidden md:inline">Active</span>
          <Switch
            id={`cat-${category.id}`}
            checked={category.is_active}
            onCheckedChange={() => toggleActive()}
            disabled={isPending}
            className="scale-90"
          />
        </label>
      </span>

      {editing ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={saveRename}
            disabled={pending || !name.trim()}
            aria-label="Save category name"
          >
            <Check className="size-4 text-status-success" aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setName(category.name);
              setEditing(false);
            }}
            disabled={pending}
            aria-label="Cancel edit"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </>
      ) : (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            aria-label="Rename category"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={remove}
            disabled={isPending}
            aria-label="Delete category"
          >
            <Trash2 className="size-4 text-status-destructive" aria-hidden="true" />
          </Button>
        </>
      )}
    </li>
  );
}

/**
 * Category buckets for the Assessment Library. Categories are optional — a
 * template without one shows as "Uncategorised" — but grouping keeps a busy
 * library scannable.
 */
export function AssessmentCategoryDialog({
  open,
  onOpenChange,
  categories,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ClinicAssessmentCategory[];
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  function add() {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error("Give the category a name.");
      return;
    }
    setPending(true);
    startTransition(async () => {
      const result = await saveAssessmentCategoryAction({
        name: trimmed,
        isActive: true,
      });
      setPending(false);
      if (result.ok) {
        toast.success("Category added.");
        setNewName("");
        onChanged();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
          <DialogDescription>
            Buckets for filing assessments, e.g. Anxiety, Depression, ADHD.
            Deleting a category leaves its templates uncategorised.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="new-category">New category</Label>
            <Input
              id="new-category"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              placeholder="e.g. Trauma"
            />
          </div>
          <Button onClick={add} disabled={pending || !newName.trim()} className="gap-1.5">
            <Plus className="size-4" aria-hidden="true" />
            Add
          </Button>
        </div>

        {categories.length > 0 ? (
          <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
            {categories.map((category) => (
              <CategoryRow key={category.id} category={category} onChanged={onChanged} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Inbox}
            title="No categories yet"
            description="Add a category above, or leave assessments uncategorised."
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}