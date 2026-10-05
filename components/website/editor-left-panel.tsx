"use client";

import { useState } from "react";
import {
  Activity,
  Award,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Eye,
  EyeOff,
  GripVertical,
  Images,
  Info,
  LayoutTemplate,
  MapPin,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHoverTip } from "@/components/ui/hover-tip";
import { SECTION_LIBRARY } from "@/types/website";
import type { WebsiteSectionConfig, WebsiteSectionId } from "@/types/website";
import { cn } from "@/lib/utils";

/**
 * The builder's left rail: the page's own outline, then a searchable list of
 * every section the site can hold.
 *
 * Ordering lives here rather than over the preview because the whole list is
 * visible at once — dragging inside a scrolling canvas makes you lose your
 * place, which is why drag-and-drop editors need explicit move buttons anyway.
 * Both are here: drag for speed, arrows for certainty.
 *
 * Nothing is ever removed from the page. A switched-off section keeps its copy,
 * so turning it back on restores work rather than making the doctor retype it.
 */

/** Per-section glyphs, shared with the builder's collapsed icon rail. */
export const SECTION_ICONS: Record<WebsiteSectionId, LucideIcon> = {
  hero: LayoutTemplate,
  doctors: Stethoscope,
  about: Info,
  services: Activity,
  booking: CalendarPlus,
  gallery: Images,
  experience: Award,
  faq: CircleHelp,
  contact: MapPin,
};

type Props = {
  sections: WebsiteSectionConfig[];
  selectedId: WebsiteSectionId | null;
  onSelect: (id: WebsiteSectionId) => void;
  onToggle: (id: WebsiteSectionId) => void;
  onMove: (id: WebsiteSectionId, direction: -1 | 1) => void;
  onReorder: (fromId: WebsiteSectionId, toId: WebsiteSectionId) => void;
};

export function EditorLeftPanel({
  sections,
  selectedId,
  onSelect,
  onToggle,
  onMove,
  onReorder,
}: Props) {
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<WebsiteSectionId | null>(null);
  const [dropTarget, setDropTarget] = useState<WebsiteSectionId | null>(null);
  const { tipProps, hideTip, tooltip } = useHoverTip();

  const ordered = [...sections].sort((a, b) => a.order - b.order);

  const trimmed = query.trim().toLowerCase();
  const matches = trimmed
    ? SECTION_LIBRARY.filter((kind) =>
        `${kind.label} ${kind.blurb}`.toLowerCase().includes(trimmed),
      )
    : SECTION_LIBRARY;

  const tip = (label: string) => tipProps(label);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Page outline */}
      <div className="border-b border-text-muted/20 px-3 py-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Page sections
          </h2>
          <span className="text-xs text-text-muted">
            {ordered.filter((section) => section.visible).length} of {ordered.length} on
          </span>
        </div>

        <ul className="mt-2 flex flex-col gap-0.5" onMouseLeave={hideTip}>
          {ordered.map((section, index) => {
            const Icon = SECTION_ICONS[section.id];
            const isSelected = section.id === selectedId;
            const isDropTarget =
              dropTarget === section.id && dragging !== section.id;

            return (
              <li key={section.id}>
                <div
                  draggable
                  onDragStart={() => setDragging(section.id)}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropTarget(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (dragging && dragging !== section.id) {
                      setDropTarget(section.id);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging) onReorder(dragging, section.id);
                    setDragging(null);
                    setDropTarget(null);
                  }}
                  className={cn(
                    "flex items-center gap-0.5 rounded-control border py-1 pe-1 ps-1.5 transition-colors",
                    isSelected
                      ? "border-primary/40 bg-primary/5"
                      : "border-transparent hover:bg-app",
                    isDropTarget && "border-dashed border-primary",
                    dragging === section.id && "opacity-50",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="cursor-grab text-text-muted/50 active:cursor-grabbing"
                  >
                    <GripVertical className="size-4" />
                  </span>

                  <button
                    type="button"
                    onClick={() => onSelect(section.id)}
                    aria-current={isSelected ? "true" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-control px-1 py-1 text-start"
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-control",
                        isSelected ? "bg-primary/10 text-primary" : "bg-app text-text-muted",
                      )}
                    >
                      <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          section.visible
                            ? "text-text-primary"
                            : "text-text-muted",
                        )}
                      >
                        {section.label}
                      </span>
                      {/* The position number is the one numeral here that carries
                          real information — it is the order, not decoration. */}
                      <span className="block text-[11px] text-text-muted">
                        {section.visible ? `Position ${index + 1}` : "Hidden"}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${section.label} up`}
                      disabled={index === 0}
                      onClick={() => onMove(section.id, -1)}
                      {...tip(`Move ${section.label} up`)}
                      className="size-7"
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${section.label} down`}
                      disabled={index === ordered.length - 1}
                      onClick={() => onMove(section.id, 1)}
                      {...tip(`Move ${section.label} down`)}
                      className="size-7"
                    >
                      <ChevronDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        section.visible ? `Hide ${section.label}` : `Show ${section.label}`
                      }
                      aria-pressed={section.visible}
                      onClick={() => onToggle(section.id)}
                      {...tip(section.visible ? "Hide this section" : "Show this section")}
                      className="size-7"
                    >
                      {section.visible ? <Eye /> : <EyeOff />}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Block library */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            All sections
          </h2>
          <Badge variant="outline">
            {ordered.filter((section) => section.visible).length} live
          </Badge>
        </div>

        <div className="mt-2 px-1">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sections"
            aria-label="Search sections"
            className="h-9"
          />
        </div>

        <ul className="mt-3 flex flex-col gap-1.5">
          {matches.map((kind) => {
            const Icon = SECTION_ICONS[kind.id];
            const entry = ordered.find((section) => section.id === kind.id);
            const live = entry?.visible ?? false;
            return (
              <li key={kind.id}>
                <button
                  type="button"
                  onClick={() => onSelect(kind.id)}
                  aria-pressed={kind.id === selectedId}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-control border p-2.5 text-start transition-colors",
                    kind.id === selectedId
                      ? "border-primary/40 bg-primary/5"
                      : live
                        ? "border-text-muted/25 bg-surface hover:border-text-muted/40"
                        : "border-dashed border-text-muted/35 bg-app/60 hover:border-primary/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-control",
                      live ? "bg-primary/10 text-primary" : "bg-app text-text-muted",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "truncate text-sm font-medium",
                          live ? "text-text-primary" : "text-text-secondary",
                        )}
                      >
                        {kind.label}
                      </span>
                      {kind.dataDriven ? (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          Live
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-text-muted">
                      {kind.blurb}
                    </span>
                  </span>
                  {live ? (
                    <Eye className="mt-1 size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                  ) : (
                    <EyeOff className="mt-1 size-3.5 shrink-0 text-text-muted/60" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
          {matches.length === 0 ? (
            <li className="px-1 py-4 text-center text-xs text-text-muted">
              No section matches “{query}”.
            </li>
          ) : null}
        </ul>

        <p className="flex items-start gap-1.5 px-1 pt-3 text-xs leading-relaxed text-text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Every section stays on your page until you switch it off, so turning one back
          on never loses the copy you wrote.
        </p>
      </div>

      {tooltip}
    </div>
  );
}
