"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight, Camera, Link2, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PhotoLightbox } from "@/components/patients/record/workspaces/derm-photo-viewer";
import { linkDermPhotoToLesionAction } from "@/lib/actions/specialty-workspaces";
import {
  IMAGE_KIND_LABEL,
  PHOTO_TYPE_LABEL,
  photoAlt,
  photoThumbHref,
} from "@/lib/derm-photo-utils";
import { patientDirectoryHref } from "@/lib/patient-directory";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";
import { cn } from "@/lib/utils";
import type { DermLesion, DermPhoto } from "@/types/database";

function byTakenAtDesc(a: DermPhoto, b: DermPhoto): number {
  return b.taken_at.localeCompare(a.taken_at);
}

/**
 * Column 2 of the examination workspace: dermoscopy photos synced to the
 * active pin. Photos already linked to the pin lead, untagged photos from the
 * same body region follow; any photo can be linked/unlinked to the pin, and
 * the oldest vs newest shots can be compared with a drag slider.
 */
export function PinPhotosPanel({
  documents,
  photos,
  selectedLesion,
  params,
  canManage,
}: {
  documents: PatientDocumentView[];
  photos: DermPhoto[];
  selectedLesion: DermLesion | null;
  params: { selectedId: string };
  canManage: boolean;
}) {
  const router = useRouter();
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * In-tab lightbox: clicking a thumbnail (or the main image) opens the zoom
   * overlay WITHOUT leaving the examination tab — the "Open Photos & Body
   * Map" link stays as the only explicit navigation away.
   */
  const [lightboxPhoto, setLightboxPhoto] = useState<DermPhoto | null>(null);

  const imageDocs = useMemo(
    () =>
      new Set(
        documents
          .filter((doc) => doc.mime_type.startsWith("image/"))
          .map((doc) => doc.id),
      ),
    [documents],
  );

  const available = useMemo(
    () =>
      photos.filter(
        (photo) => photo.document_id && imageDocs.has(photo.document_id),
      ),
    [photos, imageDocs],
  );

  const working = useMemo(() => {
    if (!selectedLesion) {
      return [...available].sort(byTakenAtDesc).slice(0, 9);
    }
    const linked = available.filter(
      (photo) => photo.lesion_id === selectedLesion.id,
    );
    const region = available.filter(
      (photo) =>
        photo.lesion_id === null &&
        photo.body_region === selectedLesion.body_region,
    );
    return [...linked, ...region].sort(byTakenAtDesc);
  }, [available, selectedLesion]);

  useEffect(() => {
    setSelectedPhotoId(working[0]?.id ?? null);
  }, [working]);

  const main =
    working.find((photo) => photo.id === selectedPhotoId) ?? working[0] ?? null;

  /**
   * Before/after timeline for the pin. When the pin has its own linked shots
   * across visits, compare within those — the exact-lesion progression a
   * doctor needs. Otherwise fall back to the same-region working set.
   */
  const timeline = useMemo(() => {
    if (!selectedLesion) {
      return [...working].sort((a, b) => a.taken_at.localeCompare(b.taken_at));
    }
    const linked = working.filter(
      (photo) => photo.lesion_id === selectedLesion.id,
    );
    const source = linked.length >= 2 ? linked : working;
    return [...source].sort((a, b) => a.taken_at.localeCompare(b.taken_at));
  }, [working, selectedLesion]);
  const first = timeline[0] ?? null;
  const last = timeline[timeline.length - 1] ?? null;

  async function setLink(photo: DermPhoto, lesionId: string | null) {
    if (busy) return;
    setBusy(true);
    const result = await linkDermPhotoToLesionAction({
      id: photo.id,
      lesion_id: lesionId,
    });
    setBusy(false);
    if (result.ok) {
      toast.success(lesionId ? "Photo linked to pin" : "Photo unlinked");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="space-y-3">
      {main ? (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setLightboxPhoto(main)}
            aria-label={`Open ${photoAlt(main)} in zoom viewer`}
            className="relative block w-full cursor-zoom-in overflow-hidden rounded-control border border-hairline bg-app/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoThumbHref(main.document_id as string, 1200)}
              alt={photoAlt(main)}
              loading="lazy"
              decoding="async"
              className="aspect-[4/3] w-full object-contain"
            />
            <span className="absolute left-2 top-2 rounded-pill bg-black/55 px-2 py-0.5 text-[10.5px] font-semibold text-white">
              {IMAGE_KIND_LABEL[main.image_kind]} ·{" "}
              {PHOTO_TYPE_LABEL[main.photo_type]} · {main.taken_at.slice(0, 10)}
            </span>
          </button>
          <p className="text-ink-faint text-[11px]">
            {main.lesion_id && main.lesion_id === selectedLesion?.id
              ? `Linked to Pin #${selectedLesion.pin_number} · ${main.body_region}`
              : main.body_region}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-hairline p-4 text-center">
          <Camera aria-hidden="true" className="text-ink-faint size-5" />
          <p className="text-ink-faint mt-2 text-[11.5px]">
            {selectedLesion
              ? `No photos for Pin #${selectedLesion.pin_number} / ${selectedLesion.body_region} yet.`
              : "No tagged skin photos yet."}
          </p>
        </div>
      )}

      {working.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {working.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => {
                setSelectedPhotoId(photo.id);
                setComparing(false);
                // In-tab lightbox — never a tab jump to derm_photos.
                setLightboxPhoto(photo);
              }}
              className={cn(
                "relative overflow-hidden rounded-control border transition-colors",
                photo.id === main?.id
                  ? "border-primary ring-2 ring-primary/25"
                  : "border-hairline hover:border-primary/50",
              )}
              aria-label={`Show ${photoAlt(photo)}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoThumbHref(photo.document_id as string, 96)}
                alt={photoAlt(photo)}
                loading="lazy"
                decoding="async"
                className="size-12 object-cover"
              />
              {selectedLesion && photo.lesion_id === selectedLesion.id && (
                <span className="absolute bottom-0 right-0 rounded-tl-[6px] bg-[#dc2626] px-1 py-px text-[9px] font-bold text-white">
                  #{selectedLesion.pin_number}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {(first || last) && first?.id !== last?.id && (
        <div className="border-t border-hairline pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            aria-pressed={comparing}
            onClick={() => setComparing((value) => !value)}
          >
            <ArrowLeftRight aria-hidden="true" className="size-3.5" />
            {comparing ? "Hide comparison" : "Before vs today"}
          </Button>
        </div>
      )}

      {comparing && first && last && (
        <ComparisonSlider before={first} after={last} />
      )}

      {selectedLesion && main && canManage && (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          {main.lesion_id === selectedLesion.id ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() => void setLink(main, null)}
            >
              <Unlink aria-hidden="true" className="size-3.5" />
              Unlink from Pin #{selectedLesion.pin_number}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() => void setLink(main, selectedLesion.id)}
            >
              <Link2 aria-hidden="true" className="size-3.5" />
              Link to Pin #{selectedLesion.pin_number}
            </Button>
          )}
        </div>
      )}

      {/* In-tab HD viewer: zoom/pan without leaving the examination tab. */}
      <PhotoLightbox
        photo={lightboxPhoto}
        documentId={lightboxPhoto?.document_id ?? undefined}
        pinNumber={selectedLesion?.pin_number ?? null}
        open={lightboxPhoto !== null}
        onClose={() => setLightboxPhoto(null)}
      />

      <Button asChild variant="outline" size="sm" className="w-full">
        <Link
          href={patientDirectoryHref({
            selectedId: params.selectedId,
            tab: "derm_photos",
          })}
          scroll={false}
        >
          Open Photos &amp; Body Map
        </Link>
      </Button>
    </div>
  );
}

/** Drag-the-divider before/after comparison (spec: Before vs Today slider). */
function ComparisonSlider({
  before,
  after,
}: {
  before: DermPhoto;
  after: DermPhoto;
}) {
  const [pos, setPos] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  function updateFromClientX(clientX: number) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(98, Math.max(2, next)));
  }

  return (
    <div className="space-y-1.5">
      <div
        ref={frameRef}
        className="relative aspect-[4/3] w-full cursor-ew-resize select-none overflow-hidden rounded-control border border-hairline"
        onPointerDown={(event) => {
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromClientX(event.clientX);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) updateFromClientX(event.clientX);
        }}
        onPointerUp={(event) => {
          draggingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        {/* Today stays full-bleed underneath. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoThumbHref(after.document_id as string, 640)}
          alt={photoAlt(after)}
          className="absolute inset-0 size-full object-cover"
        />
        {/* Before is clipped to the left of the divider. */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoThumbHref(before.document_id as string, 640)}
            alt={photoAlt(before)}
            className="absolute inset-0 size-full object-cover"
          />
        </div>
        <div
          className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          style={{ left: `${pos}%` }}
          aria-hidden="true"
        />
        <span className="absolute left-2 top-2 rounded-pill bg-black/55 px-2 py-0.5 text-[10.5px] font-semibold text-white">
          Before · {before.taken_at.slice(0, 10)}
        </span>
        <span className="absolute right-2 top-2 rounded-pill bg-black/55 px-2 py-0.5 text-[10.5px] font-semibold text-white">
          Today · {after.taken_at.slice(0, 10)}
        </span>
      </div>
      <p className="text-ink-faint text-[11px]">Drag the divider to compare.</p>
    </div>
  );
}
