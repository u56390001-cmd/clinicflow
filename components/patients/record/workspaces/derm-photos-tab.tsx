"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ImageOff, ImagePlus, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { PhotoLightbox } from "@/components/patients/record/workspaces/derm-photo-viewer";
import { ConfirmDeleteButton } from "@/components/patients/record/workspaces/confirm-delete";
import { SpecialtyHeading } from "@/components/patients/record/workspaces/specialty-form";
import {
  RecordEmpty,
  RecordNote,
  RecordSection,
} from "@/components/patients/record/record-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteDermPhotoAction,
  saveDermPhotoAction,
} from "@/lib/actions/specialty-workspaces";
import { uploadDermImageAction } from "@/lib/actions/patient-documents";
import {
  IMAGE_KIND_BADGE_CLASS,
  IMAGE_KIND_LABEL,
  PHOTO_TYPE_LABEL,
  photoAlt,
  photoThumbHref,
} from "@/lib/derm-photo-utils";
import { patientDirectoryHref } from "@/lib/patient-directory";
import { patientDocumentHref } from "@/lib/patient-documents-queries";
import type { PatientDermBundle } from "@/lib/patient-record";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";
import type { DermImageKind, DermPhoto, PatientDirectoryRow } from "@/types/database";
import { cn } from "@/lib/utils";

const PHOTO_TYPES = [
  { value: "baseline", label: "Baseline" },
  { value: "follow_up", label: "Follow-up" },
  { value: "post_treatment", label: "Post-treatment" },
] as const;

const IMAGE_KINDS: Array<{ value: DermImageKind; label: string }> = [
  { value: "clinical", label: "📸 Clinical View" },
  { value: "dermoscopy", label: "🔬 Dermoscopy" },
  { value: "histology", label: "🧫 Histology / Biopsy" },
];

const BODY_REGIONS = [
  "Scalp",
  "Face / Ears",
  "Neck",
  "Chest",
  "Back",
  "Abdomen",
  "Shoulders",
  "Upper arm — Left",
  "Upper arm — Right",
  "Forearm — Left",
  "Forearm — Right",
  "Hands",
  "Thighs",
  "Lower legs",
  "Feet",
  "Nails",
  "Groin / Genitals",
] as const;

/**
 * The image for a tagged photo, resolved from the patient's uploaded documents.
 * Documents are private, so the `src` is the access-checked redirect route, not
 * a storage URL. `width` requests a server-resized render for fast grids.
 */
function PhotoImage({
  photo,
  documentId,
  width,
  className,
}: {
  photo: DermPhoto;
  documentId?: string;
  /** Optional server-side resize width — omit for full resolution. */
  width?: number;
  className?: string;
}) {
  if (!documentId) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-1 bg-app text-text-muted",
          className,
        )}
      >
        <ImageOff aria-hidden="true" className="size-5" />
        <span className="text-[11px]">No image linked</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={width ? photoThumbHref(documentId, width) : patientDocumentHref(documentId)}
      alt={photoAlt(photo)}
      loading="lazy"
      decoding="async"
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

export function DermPhotosTab({
  patient,
  derm,
  documents,
  canManage,
  params,
  visitId,
}: {
  patient: PatientDirectoryRow;
  derm: PatientDermBundle;
  documents: PatientDocumentView[];
  canManage: boolean;
  params: { selectedId: string };
  /** Active visit/encounter stamp for new photo tags — migration 0104. */
  visitId?: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const images = useMemo(
    () => documents.filter((doc) => doc.mime_type.startsWith("image/")),
    [documents],
  );
  const documentById = useMemo(
    () => new Map(images.map((doc) => [doc.id, doc])),
    [images],
  );
  const photoById = useMemo(
    () => new Map(derm.photos.map((photo) => [photo.id, photo])),
    [derm.photos],
  );
  const lesionById = useMemo(
    () => new Map(derm.lesions.map((lesion) => [lesion.id, lesion])),
    [derm.lesions],
  );

  /** Each explicitly paired photo, deduped so a pair renders once. */
  const comparisons = useMemo(() => {
    const seen = new Set<string>();
    const pairs: Array<{ current: DermPhoto; paired: DermPhoto }> = [];
    for (const photo of derm.photos) {
      if (!photo.paired_with) continue;
      const paired = photoById.get(photo.paired_with);
      if (!paired) continue;
      const key = [photo.id, paired.id].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ current: photo, paired });
    }
    return pairs;
  }, [derm.photos, photoById]);

  const [lightbox, setLightbox] = useState<DermPhoto | null>(null);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [documentId, setDocumentId] = useState("");
  const [uploadedName, setUploadedName] = useState("");
  const [region, setRegion] = useState("");
  const [photoType, setPhotoType] =
    useState<DermPhoto["photo_type"]>("baseline");
  const [imageKind, setImageKind] = useState<DermImageKind>("clinical");
  const [lesionId, setLesionId] = useState("");
  const [takenAt, setTakenAt] = useState("");
  const [lesionNotes, setLesionNotes] = useState("");
  const [pairedWith, setPairedWith] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDocumentId("");
    setUploadedName("");
    setRegion("");
    setPhotoType("baseline");
    setImageKind("clinical");
    setLesionId("");
    setTakenAt("");
    setLesionNotes("");
    setPairedWith("");
    setError(null);
  }

  /**
   * In-tab capture: the dropped/browsed file goes straight to storage through
   * `uploadDermImageAction` (bytes-sniffed image, private bucket) and the
   * returned document id pre-fills the tag row below — one flow, no trip to
   * the Documents tab.
   */
  async function handleFile(file: File) {
    if (!canManage || uploading) return;
    setError(null);
    setUploading(true);
    const result = await uploadDermImageAction(patient.id, file);
    setUploading(false);
    if (result.ok) {
      setDocumentId(result.data.documentId);
      setUploadedName(result.data.documentName);
      setTakenAt(new Date().toISOString().slice(0, 10));
      toast.success("Photo uploaded — now tag region, pin & modality");
    } else {
      setError(result.message);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  async function tagPhoto() {
    if (!canManage) return;
    if (!documentId) {
      setError("Upload or pick an image to tag.");
      return;
    }
    if (!region.trim()) {
      setError("Enter the body region for this photo.");
      return;
    }
    setError(null);
    setPending(true);
    const result = await saveDermPhotoAction(
      patient.id,
      {
        document_id: documentId,
        body_region: region.trim(),
        photo_type: photoType,
        image_kind: imageKind,
        lesion_id: lesionId || null,
        lesion_notes: lesionNotes || null,
        paired_with: pairedWith || null,
        taken_at: takenAt,
      },
      visitId,
    );
    setPending(false);
    if (result.ok) {
      toast.success("Photo tagged");
      reset();
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function removePhoto(id: string) {
    const result = await deleteDermPhotoAction(id);
    if (result.ok) {
      toast.success("Photo removed");
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  const lightboxDocumentId = lightbox?.document_id
    ? documentById.get(lightbox.document_id)?.id
    : undefined;
  const lightboxLesion = lightbox?.lesion_id
    ? lesionById.get(lightbox.lesion_id)
    : null;

  return (
    <div className="space-y-4">
      <SpecialtyHeading
        title="Skin images"
        description="Drop a capture here or pick an upload, tag its region, pin and modality, then compare visits side by side."
      >
        {canManage && (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link
              href={patientDirectoryHref({
                selectedId: params.selectedId,
                tab: "derm_documents",
              })}
              scroll={false}
            >
              <ImagePlus aria-hidden="true" className="size-3.5" />
              {images.length > 0 ? "Manage uploads" : "Upload images"}
            </Link>
          </Button>
        )}
      </SpecialtyHeading>

      {canManage && (
        <RecordSection title="Capture & tag a skin photo">
          {/* In-tab capture: drag & drop or browse — no Documents-tab detour. */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a skin photo"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border border-dashed p-4 text-center transition-colors",
              dragOver
                ? "border-primary bg-primary/10"
                : "border-hairline hover:border-primary/50",
            )}
          >
            {uploading ? (
              <Loader2 aria-hidden="true" className="size-5 animate-spin text-primary" />
            ) : (
              <UploadCloud aria-hidden="true" className="size-5 text-primary" />
            )}
            <p className="text-[12.5px] font-semibold text-text-primary">
              {uploading
                ? "Uploading…"
                : uploadedName
                  ? `Uploaded: ${uploadedName}`
                  : "Drop a skin photo here, or click to browse"}
            </p>
            <p className="text-ink-faint text-[11px]">
              PNG / JPEG / WebP · up to 10 MB · stored in the private
              patient-documents bucket
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = "";
              }}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label
                htmlFor="derm-photo-document"
                className="text-ink mb-1.5 block text-[12.5px] font-bold"
              >
                Uploaded image
              </label>
              <NativeSelect
                id="derm-photo-document"
                value={documentId}
                onChange={(event) => {
                  setDocumentId(event.target.value);
                  setUploadedName("");
                }}
              >
                <option value="">Pick an uploaded image…</option>
                {uploadedName && documentId && (
                  <option value={documentId}>{uploadedName} (just uploaded)</option>
                )}
                {images.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.document_name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <label
                htmlFor="derm-photo-region"
                className="text-ink mb-1.5 text-[12.5px] font-bold"
              >
                Body region
              </label>
              <Input
                id="derm-photo-region"
                list="derm-body-regions"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder="e.g. Back"
                autoComplete="off"
              />
              <datalist id="derm-body-regions">
                {BODY_REGIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>

            <div>
              <label
                htmlFor="derm-photo-kind"
                className="text-ink mb-1.5 text-[12.5px] font-bold"
              >
                Modality
              </label>
              <NativeSelect
                id="derm-photo-kind"
                value={imageKind}
                onChange={(event) =>
                  setImageKind(event.target.value as DermImageKind)
                }
              >
                {IMAGE_KINDS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <label
                htmlFor="derm-photo-type"
                className="text-ink mb-1.5 text-[12.5px] font-bold"
              >
                Photo type
              </label>
              <NativeSelect
                id="derm-photo-type"
                value={photoType}
                onChange={(event) =>
                  setPhotoType(
                    event.target.value as DermPhoto["photo_type"],
                  )
                }
              >
                {PHOTO_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <label
                htmlFor="derm-photo-lesion"
                className="text-ink mb-1.5 text-[12.5px] font-bold"
              >
                Lesion pin #
              </label>
              <NativeSelect
                id="derm-photo-lesion"
                aria-label="Lesion pin"
                value={lesionId}
                onChange={(event) => setLesionId(event.target.value)}
              >
                <option value="">— Unassigned —</option>
                {derm.lesions.map((lesion) => (
                  <option key={lesion.id} value={lesion.id}>
                    Pin #{lesion.pin_number} · {lesion.body_region}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <label
                htmlFor="derm-photo-date"
                className="text-ink mb-1.5 text-[12.5px] font-bold"
              >
                Taken on
              </label>
              <Input
                id="derm-photo-date"
                type="date"
                value={takenAt}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setTakenAt(event.target.value)}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-2">
              <label
                htmlFor="derm-photo-pair"
                className="text-ink mb-1.5 text-[12.5px] font-bold"
              >
                Before / after pair
              </label>
              <NativeSelect
                id="derm-photo-pair"
                value={pairedWith}
                onChange={(event) => setPairedWith(event.target.value)}
              >
                <option value="">— None —</option>
                {derm.photos.map((photo) => (
                  <option key={photo.id} value={photo.id}>
                    {photo.body_region} ·{" "}
                    {PHOTO_TYPE_LABEL[photo.photo_type]} · {photo.taken_at}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-ink-faint mt-1 text-[11px]">
                Link this photo to an earlier one to show them side by side.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label
              htmlFor="derm-photo-notes"
              className="text-ink mb-1.5 block text-[12.5px] font-bold"
            >
              Lesion notes
            </label>
            <Textarea
              id="derm-photo-notes"
              rows={2}
              value={lesionNotes}
              onChange={(event) => setLesionNotes(event.target.value)}
              placeholder="Site, size, morphology, change since last visit…"
            />
          </div>

          {error && (
            <p className="mt-2 text-[12px] font-medium text-status-destructive">
              {error}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={tagPhoto}
              disabled={pending || uploading}
              className="gap-1.5"
            >
              {pending ? (
                <Loader2
                  aria-hidden="true"
                  className="size-3.5 animate-spin"
                />
              ) : (
                <Camera aria-hidden="true" className="size-3.5" />
              )}
              {pending ? "Saving…" : "Tag photo"}
            </Button>
          </div>
        </RecordSection>
      )}

      {comparisons.length > 0 && (
        <div className="space-y-3">
          <SpecialtyHeading
            title="Before / after"
            description="Explicitly paired photos, newest first"
          />
          {comparisons.map(({ current, paired }) => (
            <RecordSection
              key={current.id}
              title={`${current.body_region} · before / after`}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className="bg-primary/10 text-primary">
                  {current.body_region}
                </Badge>
                <span className="text-ink-faint text-[11px]">
                  {paired.taken_at} → {current.taken_at}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[paired, current].map((photo, index) => (
                  <figure key={photo.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setLightbox(photo)}
                      className="block aspect-[4/3] w-full overflow-hidden rounded-control border border-hairline bg-app focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <PhotoImage
                        photo={photo}
                        documentId={
                          photo.document_id
                            ? documentById.get(photo.document_id)?.id
                            : undefined
                        }
                        width={640}
                      />
                    </button>
                    <figcaption className="mt-1.5 text-[11px] font-medium text-text-secondary">
                      {index === 0 ? "Before" : "After"} ·{" "}
                      {IMAGE_KIND_LABEL[photo.image_kind]} ·{" "}
                      {PHOTO_TYPE_LABEL[photo.photo_type]} · {photo.taken_at}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </RecordSection>
          ))}
        </div>
      )}

      {derm.photos.length > 0 ? (
        <div className="space-y-3">
          <SpecialtyHeading title="Tagged photos" description="Newest first" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {derm.photos.map((photo) => {
              const lesion = photo.lesion_id
                ? lesionById.get(photo.lesion_id)
                : null;
              return (
                <div
                  key={photo.id}
                  className="group flex min-w-0 flex-col overflow-hidden rounded-card border border-text-muted/20 bg-surface"
                >
                  <button
                    type="button"
                    onClick={() => setLightbox(photo)}
                    className="relative block aspect-square w-full overflow-hidden bg-app focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <PhotoImage
                      photo={photo}
                      documentId={
                        photo.document_id
                          ? documentById.get(photo.document_id)?.id
                          : undefined
                      }
                      width={480}
                    />
                    {lesion && (
                      <span className="absolute left-1.5 top-1.5 rounded-pill bg-primary px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                        Pin #{lesion.pin_number}
                      </span>
                    )}
                  </button>
                  <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[12.5px] font-semibold text-text-primary">
                        {photo.body_region}
                      </p>
                      {canManage && (
                        <ConfirmDeleteButton
                          ariaLabel={`Delete ${photo.body_region} photo`}
                          title="Remove this photo tag?"
                          description="This removes the tag only — the uploaded file stays in Documents."
                          onConfirm={() => removePhoto(photo.id)}
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-pill px-1.5 py-0.5 text-[9.5px] font-bold",
                          IMAGE_KIND_BADGE_CLASS[photo.image_kind],
                        )}
                      >
                        {IMAGE_KIND_LABEL[photo.image_kind]}
                      </span>
                      <Badge className="bg-primary/10 text-primary">
                        {PHOTO_TYPE_LABEL[photo.photo_type]}
                      </Badge>
                      <span className="text-ink-faint text-[11px]">
                        {photo.taken_at}
                      </span>
                    </div>
                    {photo.lesion_notes && (
                      <p className="line-clamp-2 text-[11.5px] text-text-secondary">
                        {photo.lesion_notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <RecordEmpty
          icon={Camera}
          title="No photos tagged yet"
          description="Drop a skin photo above, or upload in Documents and tag it with a region and modality."
        />
      )}

      <PhotoLightbox
        photo={lightbox}
        documentId={lightboxDocumentId}
        pinNumber={lightboxLesion?.pin_number ?? null}
        open={lightbox !== null && lightboxDocumentId !== undefined}
        onClose={() => setLightbox(null)}
      />

      {/* Unlinked-image fallback: a tagged photo whose document is missing. */}
      {lightbox !== null && lightboxDocumentId === undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-card border border-hairline bg-surface p-5 text-center">
            <ImageOff aria-hidden="true" className="mx-auto size-6 text-text-muted" />
            <p className="mt-2 text-[13px] font-semibold text-text-primary">
              {lightbox.body_region}
            </p>
            <RecordNote
              label="Lesion notes"
              value={lightbox.lesion_notes || "No image linked to this tag."}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setLightbox(null)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
