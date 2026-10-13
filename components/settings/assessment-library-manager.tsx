"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  Copy,
  Download,
  Eye,
  FolderCog,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Trash2,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  ASSESSMENT_TARGET_SPECIALTY_LABELS,
  canSendOnline,
  templateMaxScore,
} from "@/lib/assessment-library";
import {
  deleteAssessmentTemplateAction,
  duplicateAssessmentTemplateAction,
  setAssessmentTemplateStatusAction,
} from "@/lib/actions/assessment-library";
import { cn } from "@/lib/utils";
import type {
  AssessmentTemplate,
  ClinicAssessmentCategory,
} from "@/types/database";

import { AssessmentCategoryDialog } from "./assessment-category-dialog";
import { AssessmentGuideDialog } from "./assessment-guide-dialog";
import { AssessmentImportDialog } from "./assessment-import-dialog";
import { AssessmentTemplateBuilderDialog } from "./assessment-builder-dialog";
import { AssessmentTemplateViewDialog } from "./assessment-template-view-dialog";

type StatusFilter = "all" | "active" | "draft";

function TemplateRow({
  template,
  categoryName,
  usageCount,
  canWrite,
  onView,
  onEdit,
  onDuplicate,
  onToggle,
  onDelete,
}: {
  template: AssessmentTemplate;
  categoryName: string;
  usageCount: number;
  canWrite: boolean;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const online = canSendOnline(template);
  return (
    <li className="rounded-card border border-hairline bg-surface p-3.5 transition-shadow">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onView}
          className="min-w-0 flex-1 text-left"
          aria-label={`View ${template.name}`}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[13.5px] font-bold text-text-primary">{template.name}</p>
            <Badge variant={template.status === "active" ? "success" : "outline"}>
              {template.status}
            </Badge>
            {online ? <Badge variant="info">Online</Badge> : null}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-text-secondary">
            {template.description || "No description."}
          </p>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" aria-label="Template actions" className="gap-1.5">
              <span className="text-[11.5px] font-semibold uppercase tracking-wide">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onView}>
              <Eye className="size-4" aria-hidden="true" />
              View
            </DropdownMenuItem>
            {canWrite ? (
              <>
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="size-4" aria-hidden="true" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onToggle}>
                  {template.status === "active" ? (
                    <PowerOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Power className="size-4" aria-hidden="true" />
                  )}
                  {template.status === "active" ? "Move to draft" : "Activate"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-status-destructive focus:text-status-destructive">
                  <Trash2 className="size-4" aria-hidden="true" />
                  Delete
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{categoryName}</Badge>
        <Badge variant="outline">
          {ASSESSMENT_TARGET_SPECIALTY_LABELS[template.target_specialty]}
        </Badge>
        <Badge variant="outline">
          {template.questions.length > 0
            ? `${template.questions.length} questions`
            : "Manual score"}
        </Badge>
        {template.questions.length > 0 || template.scoring.max_score > 0 ? (
          <Badge variant="outline">Score 0–{templateMaxScore(template.scoring)}</Badge>
        ) : null}
        {usageCount > 0 ? (
          <Badge variant="outline">
            Used in {usageCount} record{usageCount === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Settings → Clinical Settings → Assessment Library manager.
 *
 * Reads arrive from the server page; every write calls the admin-gated actions
 * in lib/actions/assessment-library.ts, then refreshes the route so the list
 * and counts come back from the database.
 */
export function AssessmentLibraryManager({
  categories,
  templates,
  usage,
  canWrite,
  initialCategory,
}: {
  categories: ClinicAssessmentCategory[];
  templates: AssessmentTemplate[];
  usage: Record<string, number>;
  canWrite: boolean;
  initialCategory: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>(
    initialCategory ?? "all",
  );

  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderInitial, setBuilderInitial] = useState<AssessmentTemplate | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [viewTemplate, setViewTemplate] = useState<AssessmentTemplate | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [deleting, setDeleting] = useState<AssessmentTemplate | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  const categoryName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const category of categories) map[category.id] = category.name;
    return map;
  }, [categories]);

  const categoryId = useMemo(
    () => new Set(categories.map((c) => c.id)),
    [categories],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (status !== "all" && template.status !== status) return false;
      if (categoryFilter === "uncategorised") {
        if (template.category_id !== null) return false;
      } else if (categoryFilter !== "all") {
        if (template.category_id !== categoryFilter) return false;
      }
      if (term !== "") {
        const haystack = [
          template.name,
          template.description ?? "",
          categoryName[template.category_id ?? ""] ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [templates, status, categoryFilter, search, categoryName]);

  const activeCount = templates.filter((t) => t.status === "active").length;
  const draftCount = templates.length - activeCount;

  function refresh() {
    router.refresh();
  }

  function run(id: string, task: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy((prev) => ({ ...prev, [id]: true }));
    startTransition(async () => {
      const result = await task();
      setBusy((prev) => ({ ...prev, [id]: false }));
      if (result.ok) refresh();
      else toast.error(result.message ?? "Something went wrong.");
    });
  }

  function openCreate() {
    setBuilderInitial(null);
    setBuilderOpen(true);
  }

  function openEdit(template: AssessmentTemplate) {
    setBuilderInitial(template);
    setBuilderOpen(true);
  }

  const flow = [
    { key: "all" as const, label: "All", count: templates.length },
    { key: "active" as const, label: "Active", count: activeCount },
    { key: "draft" as const, label: "Draft", count: draftCount },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-[-0.01em] text-text-primary">
            Assessment Library
          </h1>
          <p className="mt-0.5 text-[13px] leading-relaxed text-text-secondary">
            The psychological assessments your clinic uses — build templates,
            score them, and send them to patients.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setGuideOpen(true)} className="gap-1.5">
            <BookOpen className="size-4" aria-hidden="true" />
            Guide
          </Button>
          {canWrite ? (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
                <Download className="size-4" aria-hidden="true" />
                Import
              </Button>
              <Button onClick={openCreate} className="gap-1.5">
                <Plus className="size-4" aria-hidden="true" />
                Create assessment
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-control border border-hairline bg-surface p-1">
            {flow.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setStatus(item.key)}
                className={cn(
                  "rounded-control px-2.5 py-1 text-[12px] font-semibold transition-colors",
                  status === item.key
                    ? "bg-primary text-white"
                    : "text-text-secondary hover:bg-skeleton hover:text-text-primary",
                )}
              >
                {item.label} ({item.count})
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search
              className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              aria-label="Search assessment templates"
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={cn(
              "rounded-pill border px-2.5 py-1 text-[12px] font-semibold transition-colors",
              categoryFilter === "all"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-hairline bg-surface text-text-secondary hover:bg-skeleton",
            )}
          >
            All categories
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("uncategorised")}
            className={cn(
              "rounded-pill border px-2.5 py-1 text-[12px] font-semibold transition-colors",
              categoryFilter === "uncategorised"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-hairline bg-surface text-text-secondary hover:bg-skeleton",
            )}
          >
            Uncategorised
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryFilter(category.id)}
              className={cn(
                "rounded-pill border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                categoryFilter === category.id
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-hairline bg-surface text-text-secondary hover:bg-skeleton",
              )}
            >
              {category.name}
            </button>
          ))}
          {canWrite ? (
            <Button size="sm" variant="ghost" onClick={() => setCategoriesOpen(true)} className="gap-1.5">
              <FolderCog className="size-4" aria-hidden="true" />
              Edit categories
            </Button>
          ) : null}
        </div>
      </div>

      {filtered.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              categoryName={
                template.category_id
                  ? (categoryName[template.category_id] ?? "Uncategorised")
                  : "Uncategorised"
              }
              usageCount={usage[template.id] ?? 0}
              canWrite={canWrite}
              onView={() => setViewTemplate(template)}
              onEdit={() => openEdit(template)}
              onDuplicate={() => {
                run(template.id, () => duplicateAssessmentTemplateAction(template.id));
                toast.success("Copy made — find it under Draft.");
              }}
              onToggle={() =>
                run(template.id, () =>
                  setAssessmentTemplateStatusAction(
                    template.id,
                    template.status === "active" ? "draft" : "active",
                  ),
                )
              }
              onDelete={() => setDeleting(template)}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title={templates.length === 0 ? "No assessments in your library yet" : "Nothing matches"}
          description={
            templates.length === 0
              ? "Import standard instruments or build your own template. Active assessments appear in the Psychology workspace."
              : "Try a different search, status or category."
          }
          actionLabel={templates.length === 0 && canWrite ? "Import a standard instrument" : undefined}
          onAction={templates.length === 0 && canWrite ? () => setImportOpen(true) : undefined}
        />
      )}

      {canWrite ? (
        <>
          <AssessmentTemplateBuilderDialog
            open={builderOpen}
            onOpenChange={setBuilderOpen}
            categories={categories}
            initial={builderInitial}
            onSaved={refresh}
          />
          <AssessmentImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            categories={categories}
            onImported={refresh}
          />
          <AssessmentCategoryDialog
            open={categoriesOpen}
            onOpenChange={setCategoriesOpen}
            categories={categories}
            onChanged={refresh}
          />
        </>
      ) : null}

      <AssessmentTemplateViewDialog
        open={viewTemplate !== null}
        onOpenChange={(next) => {
          if (!next) setViewTemplate(null);
        }}
        template={viewTemplate}
        category={
          viewTemplate?.category_id && categoryId.has(viewTemplate.category_id)
            ? (categories.find((c) => c.id === viewTemplate.category_id) ??
                null)
            : null
        }
        usageCount={viewTemplate ? (usage[viewTemplate.id] ?? 0) : 0}
      />

      <AssessmentGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />

      <Dialog open={deleting !== null} onOpenChange={(next) => { if (!next) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              Assessements already recorded against this template keep their
              name and score — only the template is removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy[deleting?.id ?? ""] ?? false}
              onClick={() => {
                if (!deleting) return;
                run(deleting.id, () => deleteAssessmentTemplateAction(deleting.id));
                setDeleting(null);
                toast.success("Template deleted.");
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}