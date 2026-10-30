"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Plus, Search } from "lucide-react";

import {
  BACK_ANCHORS,
  DermBodyMapFlat,
  FRONT_ANCHORS,
  nearestAnchor,
  type Anchor,
} from "@/components/patients/record/workspaces/derm-body-map";
import { Input } from "@/components/ui/input";
import { saveDermLesionAction } from "@/lib/actions/specialty-workspaces";
import type { DermLesion } from "@/types/database";
import { cn } from "@/lib/utils";

/**
 * Laterality from the click position, matching the silhouette's own
 * mirror-style labels (viewer-left = "Left upper arm", on both views).
 * The centre band — trunk, face midline — is not a side: it is "central".
 */
function lateralityFor(bodyX: number): DermLesion["laterality"] {
  if (bodyX < 0.42) return "left";
  if (bodyX > 0.58) return "right";
  return "central";
}

/**
 * Column 1 of the examination workspace: the interactive 2D body map plus an
 * anatomical region search.
 *
 * The 3D r3f canvas was removed (clinic-PC lag; three.js never justified a pin
 * map), so pin-adding is either a precise click or a region search pick — the
 * search list is genuinely useful for scalp, nails and palms where a schematic
 * silhouette is hard to click.
 */
export function BodyMapPanel({
  patientId,
  examId,
  lesions,
  canManage,
  visitId,
  selectedId,
  onSelect,
}: {
  patientId: string;
  examId: string | null;
  lesions: DermLesion[];
  canManage: boolean;
  /** Active visit/encounter stamp for new pins — migration 0104. */
  visitId?: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<"front" | "back">("front");
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  function selectPin(id: string) {
    onSelect(id);
    const lesion = lesions.find((item) => item.id === id);
    if (lesion) setView(lesion.body_view);
  }

  async function addPin(
    body_view: "front" | "back",
    body_x: number,
    body_y: number,
    anchor: Anchor,
  ) {
    if (!canManage || adding) return;
    setAdding(true);
    const result = await saveDermLesionAction(
      patientId,
      {
        exam_id: examId ?? "",
        body_region: anchor.name,
        body_view,
        body_x: Number(body_x.toFixed(4)),
        body_y: Number(body_y.toFixed(4)),
        // Auto-set from the click side — the editor's own picker stays as the
        // override for bilateral / refined readings.
        laterality: lateralityFor(body_x),
      },
      visitId,
    );
    setAdding(false);
    if (result.ok) {
      onSelect(result.data);
      setView(body_view);
      toast.success(`Pin added — ${anchor.name}`);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  function addFrom2D(x: number, y: number) {
    const anchor = nearestAnchor(
      view === "front" ? FRONT_ANCHORS : BACK_ANCHORS,
      x,
      y,
    );
    void addPin(view, x / 200, y / 400, anchor);
  }

  /** Region search: matches the active view's anchors; pick = pin at anchor. */
  const anchorMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (view === "front" ? FRONT_ANCHORS : BACK_ANCHORS)
      .filter((anchor) => anchor.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, view]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div
          className="inline-flex rounded-control border border-hairline p-0.5"
          role="group"
          aria-label="Body side"
        >
          {(["front", "back"] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => setView(side)}
              aria-pressed={view === side}
              className={cn(
                "rounded-[6px] px-3 py-1 text-[12px] font-semibold capitalize transition-colors",
                view === side
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {side}
            </button>
          ))}
        </div>
      </div>

      {/* Anatomical region search — a searchable shortcut to pin creation for
          hard-to-click regions (scalp, palms, nails). */}
      <div className="relative mb-2">
        <Search
          aria-hidden="true"
          className="text-ink-faint pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search region (e.g. malar, forearm, scalp)…"
          aria-label="Search body region"
          className="h-8 pl-8 text-[12px]"
        />
        {anchorMatches.length > 0 && (
          <ul
            role="listbox"
            aria-label="Matching body regions"
            className="absolute z-10 mt-1 w-full overflow-hidden rounded-control border border-hairline bg-surface shadow-lg"
          >
            {anchorMatches.map((anchor) => (
              <li key={anchor.name}>
                <button
                  type="button"
                  disabled={!canManage || adding}
                  onClick={() => {
                    void addPin(view, anchor.x / 200, anchor.y / 400, anchor);
                    setQuery("");
                  }}
                  className="text-text-secondary hover:bg-primary/10 hover:text-primary flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] transition-colors disabled:opacity-50"
                >
                  <span>{anchor.name}</span>
                  <span className="text-ink-faint flex items-center gap-1 text-[10px]">
                    <Plus aria-hidden="true" className="size-3" />
                    add pin
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && (
        <p className="text-ink-faint mb-1.5 flex items-center gap-1 text-[11px]">
          <MapPin aria-hidden="true" className="size-3" />
          Click the body to drop a pin — laterality auto-set from the side
        </p>
      )}
      {adding && (
        <p className="mb-1.5 text-[11px] font-medium text-primary">
          Saving pin…
        </p>
      )}

      <DermBodyMapFlat
        view={view}
        lesions={lesions}
        selectedId={selectedId}
        onSelect={selectPin}
        onAddAt={addFrom2D}
        canManage={canManage}
      />

      {lesions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {lesions.map((lesion) => (
            <button
              key={lesion.id}
              type="button"
              onClick={() => selectPin(lesion.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                lesion.id === selectedId
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-hairline text-text-secondary hover:border-primary/50",
              )}
            >
              <span className="grid size-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-white">
                {lesion.pin_number}
              </span>
              {lesion.body_region}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
