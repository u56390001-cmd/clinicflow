"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Box,
  LayoutGrid,
  Plus,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import {
  BACK_ANCHORS,
  DermBodyMapFlat,
  FRONT_ANCHORS,
  nearestAnchor,
  type Anchor,
} from "@/components/patients/record/workspaces/derm-body-map";
import type {
  Map3DCommand,
  PinDrop,
} from "@/components/patients/record/workspaces/derm-body-map-3d";
import { Button } from "@/components/ui/button";
import { saveDermLesionAction } from "@/lib/actions/specialty-workspaces";
import { cn } from "@/lib/utils";
import type { DermLesion } from "@/types/database";

/* The r3f canvas never runs on the server — keep three.js out of the route
 * bundle with a client-only dynamic import. */
const DermBodyMap3D = dynamic(
  () =>
    import("@/components/patients/record/workspaces/derm-body-map-3d").then(
      (module) => module.DermBodyMap3D,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[420px] place-items-center rounded-control border border-hairline bg-app/40">
        <p className="text-ink-faint text-[12px]">Loading 3D body model…</p>
      </div>
    ),
  },
);

/**
 * Column 1 of the examination workspace: the body map with a 2D/3D toggle,
 * zoom controls and the pin chips. Pin-adding and selection live here so both
 * modes share one state with the rest of the tab.
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
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [view, setView] = useState<"front" | "back">("front");
  const [adding, setAdding] = useState(false);
  const [command, setCommand] = useState<Map3DCommand | null>(null);

  function send(kind: "zoom" | "reset", factor = 1) {
    setCommand({ seq: Date.now(), kind, factor });
  }

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

  function addFromDrop(drop: PinDrop) {
    void addPin(drop.body_view, drop.body_x, drop.body_y, drop.anchor);
  }

  function addFrom2D(x: number, y: number) {
    const anchor = nearestAnchor(
      view === "front" ? FRONT_ANCHORS : BACK_ANCHORS,
      x,
      y,
    );
    void addPin(view, x / 200, y / 400, anchor);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div
          className="inline-flex rounded-control border border-hairline p-0.5"
          role="group"
          aria-label="Body map view mode"
        >
          <button
            type="button"
            onClick={() => setMode("3d")}
            aria-pressed={mode === "3d"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1 text-[12px] font-semibold transition-colors",
              mode === "3d"
                ? "bg-primary text-white"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            <Box aria-hidden="true" className="size-3.5" />
            3D Model
          </button>
          <button
            type="button"
            onClick={() => setMode("2d")}
            aria-pressed={mode === "2d"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1 text-[12px] font-semibold transition-colors",
              mode === "2d"
                ? "bg-primary text-white"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            <LayoutGrid aria-hidden="true" className="size-3.5" />
            2D Flat View
          </button>
        </div>

        {mode === "3d" ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Zoom in"
              onClick={() => send("zoom", 0.8)}
              className="size-7 p-0"
            >
              <ZoomIn aria-hidden="true" className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Zoom out"
              onClick={() => send("zoom", 1.25)}
              className="size-7 p-0"
            >
              <ZoomOut aria-hidden="true" className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Reset view"
              onClick={() => send("reset")}
              className="size-7 p-0"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        ) : (
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
        )}
      </div>

      {canManage && (
        <p className="text-ink-faint mb-1.5 flex items-center gap-1 text-[11px]">
          <Plus aria-hidden="true" className="size-3" />
          {mode === "3d"
            ? "Click the body to drop a pin · drag to rotate, scroll to zoom"
            : "Click the body to drop a pin"}
        </p>
      )}
      {adding && (
        <p className="mb-1.5 text-[11px] font-medium text-primary">
          Saving pin…
        </p>
      )}

      {mode === "3d" ? (
        <DermBodyMap3D
          lesions={lesions}
          selectedId={selectedId}
          onSelect={selectPin}
          onDrop={addFromDrop}
          canManage={canManage}
          command={command}
        />
      ) : (
        <DermBodyMapFlat
          view={view}
          lesions={lesions}
          selectedId={selectedId}
          onSelect={selectPin}
          onAddAt={addFrom2D}
          canManage={canManage}
        />
      )}

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
