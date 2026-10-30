"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";

import {
  IMAGE_KIND_LABEL,
  PHOTO_TYPE_LABEL,
  photoAlt,
} from "@/lib/derm-photo-utils";
import { patientDocumentHref } from "@/lib/patient-documents-queries";
import type { DermPhoto } from "@/types/database";
import { cn } from "@/lib/utils";

const ZOOM_MAX = 4;
const ZOOM_MIN = 1;
const WHEEL_STEP = 1.15;
const BUTTON_STEP = 1.4;

const clampZoom = (value: number) =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

/**
 * HD inspection surface for one skin photo: mouse-wheel zoom to 400% around
 * the cursor, click-and-drag panning when zoomed, double-click to jump 2.5x.
 *
 * Dermoscopy review lives or dies on being able to inspect pigment networks
 * and border irregularities at full resolution — a static object-contain
 * `<img>` in a dialog cannot do that.
 */
export function ZoomablePhoto({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  function reset() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function zoomTo(next: number, origin?: { x: number; y: number }) {
    const clamped = clampZoom(next);
    if (clamped === 1) {
      reset();
      return;
    }
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || !origin) {
      setZoom(clamped);
      return;
    }
    // Keep the point under the cursor fixed while the scale changes.
    const cx = origin.x - rect.left - rect.width / 2;
    const cy = origin.y - rect.top - rect.height / 2;
    setOffset((current) => {
      const ratio = clamped / zoom;
      return {
        x: cx - (cx - current.x) * ratio,
        y: cy - (cy - current.y) * ratio,
      };
    });
    setZoom(clamped);
  }

  // React attaches wheel listeners passively; a non-passive listener is
  // required to preventDefault so the page does not scroll while zooming.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = frame?.getBoundingClientRect();
      if (!rect) return;
      const cx = event.clientX - rect.left - rect.width / 2;
      const cy = event.clientY - rect.top - rect.height / 2;
      const factor = event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      setZoom((current) => {
        const next = clampZoom(current * factor);
        if (next === 1) {
          setOffset({ x: 0, y: 0 });
          return 1;
        }
        setOffset((offsetCurrent) => {
          const ratio = next / current;
          return {
            x: cx - (cx - offsetCurrent.x) * ratio,
            y: cy - (cy - offsetCurrent.y) * ratio,
          };
        });
        return next;
      });
    }
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, []);

  const zoomed = zoom > 1;

  return (
    <div className={cn("relative", className)}>
      <div className="absolute left-2 top-2 z-10 flex gap-1">
        <button
          type="button"
          onClick={() => zoomTo(zoom * BUTTON_STEP)}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Zoom in"
          className="grid size-7 place-items-center rounded-[6px] border border-white/30 bg-black/55 text-white transition-colors hover:bg-black/70 disabled:opacity-40"
        >
          <Plus aria-hidden="true" className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => zoomTo(zoom / BUTTON_STEP)}
          disabled={!zoomed}
          aria-label="Zoom out"
          className="grid size-7 place-items-center rounded-[6px] border border-white/30 bg-black/55 text-white transition-colors hover:bg-black/70 disabled:opacity-40"
        >
          <Minus aria-hidden="true" className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={!zoomed}
          aria-label="Reset zoom"
          className="grid size-7 place-items-center rounded-[6px] border border-white/30 bg-black/55 text-white transition-colors hover:bg-black/70 disabled:opacity-40"
        >
          <RotateCcw aria-hidden="true" className="size-3.5" />
        </button>
        <span className="self-center rounded-pill bg-black/55 px-2 py-0.5 text-[10.5px] font-semibold text-white">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      <div
        ref={frameRef}
        role="img"
        aria-label={alt}
        onDoubleClick={() => zoomTo(zoomed ? 1 : 2.5)}
        onPointerDown={(event) => {
          if (!zoomed) return;
          draggingRef.current = true;
          lastPointerRef.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current) return;
          const dx = event.clientX - lastPointerRef.current.x;
          const dy = event.clientY - lastPointerRef.current.y;
          lastPointerRef.current = { x: event.clientX, y: event.clientY };
          setOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
        }}
        onPointerUp={(event) => {
          draggingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        className={cn(
          "relative aspect-square w-full overflow-hidden rounded-control border border-hairline bg-black/90",
          zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          decoding="async"
          draggable={false}
          className="absolute inset-0 size-full object-contain transition-transform duration-75 will-change-transform"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          }}
        />
      </div>
      <p className="text-ink-faint mt-1 text-[11px]">
        Wheel to zoom · drag to pan · double-click for 2.5×
      </p>
    </div>
  );
}

/**
 * The dermatology lightbox: interactive HD viewer plus a clinical overlay bar
 * (pin, region, capture date, modality) so the doctor always knows which
 * lesion and visit they are inspecting.
 */
export function PhotoLightbox({
  photo,
  documentId,
  pinNumber,
  open,
  onClose,
}: {
  photo: DermPhoto | null;
  documentId?: string;
  /** Pin number when the photo is linked to a body-map lesion. */
  pinNumber?: number | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !photo || !documentId) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${photo.body_region} photo viewer`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="relative w-full max-w-3xl rounded-card border border-hairline bg-surface p-3 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close viewer"
          className="absolute -top-3 -right-3 z-10 grid size-8 place-items-center rounded-full border border-hairline bg-surface shadow-md transition-colors hover:bg-app"
        >
          <X aria-hidden="true" className="size-4" />
        </button>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          {pinNumber != null && (
            <span className="rounded-pill bg-primary px-2 py-0.5 text-[10.5px] font-bold text-white">
              Pin #{pinNumber}
            </span>
          )}
          <span className="text-ink text-[13px] font-bold">
            {photo.body_region}
          </span>
          <span className="text-ink-faint text-[11.5px]">
            {photo.taken_at} · {PHOTO_TYPE_LABEL[photo.photo_type]} ·{" "}
            {IMAGE_KIND_LABEL[photo.image_kind]}
          </span>
        </div>

        <ZoomablePhoto
          src={patientDocumentHref(documentId)}
          alt={photoAlt(photo)}
          className="w-full"
        />
      </div>
    </div>
  );
}
