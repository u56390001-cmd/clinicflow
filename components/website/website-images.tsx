"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/website/editor-fields";
import {
  addWebsiteImage,
  deleteWebsiteImage,
  reorderWebsiteImages,
} from "@/lib/actions/website";
import { createClient } from "@/lib/supabase/client";
import type { WebsiteImage } from "@/types/database";
import { cn } from "@/lib/utils";

/**
 * Image management for the builder.
 *
 * Uploads go straight to Supabase Storage from the browser and only the
 * resulting URL is written through a server action — a 5 MB photo never enters
 * a server action payload. Storage RLS (0009) requires the first path segment to
 * be the clinic id, which is what `uploadWebsiteFile` guarantees.
 *
 * Every mutation returns the next full list rather than a patch, so the parent
 * never has to reason about which record changed: one source of truth, one
 * replacement, no drift between what is stored and what is on screen.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const GALLERY_MAX = 24;

/** Why this file cannot be used, or `null` when it can. */
function imageProblem(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "not a supported image (use PNG, JPEG, WebP or GIF)";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "larger than 5 MB";
  }
  return null;
}

async function uploadWebsiteFile(
  clinicId: string,
  prefix: string,
  file: File,
): Promise<string> {
  const supabase = createClient();
  const fileExt = file.name.split(".").pop() || "jpg";
  const fileName = `${clinicId}/${prefix}-${Date.now()}.${fileExt}`;
  const { error } = await supabase.storage
    .from("website-images")
    .upload(fileName, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from("website-images").getPublicUrl(fileName).data.publicUrl;
}

/** Drop zone shared by both editors. */
function DropZone({
  dragging,
  uploading,
  label,
  hint,
  onFiles,
}: {
  dragging: boolean;
  uploading: boolean;
  label: string;
  hint?: string;
  onFiles: (files: File[]) => void;
}) {
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        onFiles(Array.from(event.dataTransfer.files ?? []));
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-control border border-dashed px-3 py-6 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-text-muted/35 bg-app/60",
      )}
    >
      {uploading ? (
        <span className="flex items-center gap-2 text-xs font-medium text-primary">
          <Spinner size="sm" /> Uploading…
        </span>
      ) : (
        <>
          <ImagePlus className="size-5 text-text-muted" aria-hidden="true" />
          <span className="text-xs font-medium text-text-secondary">{label}</span>
          {hint ? <span className="text-[11px] text-text-muted">{hint}</span> : null}
        </>
      )}
    </div>
  );
}

/**
 * One image, used for the hero banner and the clinic portrait.
 *
 * Alt text is editable inline rather than at upload time, because it is written
 * once for search engines and screen readers and then never looked at again —
 * asking for it during the upload flow is where it always gets skipped. It is
 * saved when focus leaves the field, not per keystroke.
 */
function SingleImage({
  kind,
  label,
  hint,
  images,
  clinicId,
  onChange,
}: {
  kind: "hero" | "doctor";
  label: string;
  hint?: string;
  images: WebsiteImage[];
  clinicId: string;
  onChange: (next: WebsiteImage[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const current = images.find((img) => img.kind === kind) ?? null;

  async function handleFiles(files: File[]) {
    const file = files[0];
    if (!file || uploading) return;
    const problem = imageProblem(file);
    if (problem) {
      toast.error(`"${file.name}" is ${problem}.`);
      return;
    }

    setUploading(true);
    try {
      const url = await uploadWebsiteFile(clinicId, kind, file);
      // Only one image of each kind renders, so any previous record for this kind
      // is removed before the new one is written — otherwise a stale row keeps
      // the old file alive in storage forever.
      for (const existing of images.filter((img) => img.kind === kind)) {
        await deleteWebsiteImage(null, existing.id);
      }
      const formData = new FormData();
      formData.set("kind", kind);
      formData.set("alt", current?.alt ?? "");
      formData.set("url", url);
      const result = await addWebsiteImage(null, formData);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (!result.data) {
        toast.error("The image was uploaded but could not be attached.");
        return;
      }
      toast.success(`${label} updated.`);
      onChange([...images.filter((img) => img.kind !== kind), result.data]);
    } catch (error) {
      toast.error(
        `Upload failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (!current) return;
    const result = await deleteWebsiteImage(null, current.id);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    onChange(images.filter((img) => img.id !== current.id));
  }

  async function persistAlt(alt: string) {
    if (!current || alt === current.alt) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("website_images")
      .update({ alt })
      .eq("id", current.id);
    if (error) toast.error("Could not save the description: " + error.message);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-text-secondary">{label}</p>

      {current ? (
        <div
          onDragOver={(event) => event.preventDefault()}
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFiles(Array.from(event.dataTransfer.files ?? []));
          }}
          className={cn(
            "group relative h-36 w-full overflow-hidden rounded-control border transition-colors",
            dragging ? "border-primary ring-2 ring-primary/25" : "border-text-muted/25",
          )}
        >
          <Image
            src={current.url}
            alt={current.alt || label}
            fill
            sizes="340px"
            className="object-cover"
          />
          <div className="absolute end-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={`Replace ${label.toLowerCase()}`}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="size-7 bg-white/90 text-text-primary hover:bg-white"
            >
              <RefreshCw />
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              aria-label={`Remove ${label.toLowerCase()}`}
              disabled={uploading}
              onClick={handleRemove}
              className="size-7"
            >
              <Trash2 />
            </Button>
          </div>
          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-xs font-medium text-text-secondary">
              <Spinner size="sm" /> Uploading…
            </div>
          ) : null}
        </div>
      ) : (
        <div onDragLeave={() => setDragging(false)}>
          <DropZone
            dragging={dragging}
            uploading={uploading}
            label={`Click or drop to add ${label.toLowerCase()}`}
            hint="PNG, JPEG, WebP or GIF — up to 5 MB"
            onFiles={(files) => void handleFiles(files)}
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        aria-label={`Upload ${label.toLowerCase()}`}
        className="hidden"
        onChange={(event) => void handleFiles(Array.from(event.target.files ?? []))}
      />

      {current ? (
        <TextField
          label="Description"
          value={current.alt}
          onChange={(value) =>
            onChange(images.map((img) => (img.id === current.id ? { ...img, alt: value } : img)))
          }
          onBlur={(value) => void persistAlt(value)}
          maxLength={200}
          hint={
            hint ??
            "Read aloud by screen readers and used by search engines. Describe what is in the picture."
          }
        />
      ) : null}

      {!current ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <ImagePlus data-icon="inline-start" />
          Choose a file
        </Button>
      ) : null}
    </div>
  );
}

/** Ordered grid of gallery photos with per-photo alt text and move controls. */
function GalleryEditor({
  images,
  clinicId,
  onChange,
}: {
  images: WebsiteImage[];
  clinicId: string;
  onChange: (next: WebsiteImage[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const gallery = images
    .filter((img) => img.kind === "gallery")
    .sort((a, b) => a.position - b.position);
  const room = GALLERY_MAX - gallery.length;

  async function handleFiles(incoming: File[]) {
    if (uploading || incoming.length === 0) return;
    // Per-file validation: reject only the bad ones, upload the rest.
    const usable = incoming.filter((file) => !imageProblem(file)).slice(0, Math.max(room, 0));
    const rejected = incoming.length - usable.length;

    if (rejected > 0) {
      toast.error(
        room <= 0
          ? `The gallery holds ${GALLERY_MAX} photos. Remove one first.`
          : `Skipped ${rejected} file(s) — images only, max 5 MB each, and ${GALLERY_MAX} photos per gallery.`,
      );
    }
    if (usable.length === 0) return;

    setUploading(true);
    const added: WebsiteImage[] = [];
    try {
      for (const [index, file] of usable.entries()) {
        setProgress(`Uploading ${index + 1} of ${usable.length}…`);
        const url = await uploadWebsiteFile(clinicId, "gallery", file);
        const formData = new FormData();
        formData.set("kind", "gallery");
        formData.set("alt", "");
        formData.set("url", url);
        const result = await addWebsiteImage(null, formData);
        if (!result.ok) {
          toast.error(result.message);
          continue;
        }
        if (result.data) added.push(result.data);
      }
      if (added.length > 0) {
        onChange([...images, ...added]);
        toast.success(`${added.length} photo${added.length === 1 ? "" : "s"} added.`);
      }
    } catch (error) {
      toast.error(
        `Upload failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      setUploading(false);
      setProgress("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(imageId: string) {
    const result = await deleteWebsiteImage(null, imageId);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    onChange(images.filter((img) => img.id !== imageId));
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= gallery.length) return;
    const next = [...gallery];
    [next[index], next[target]] = [next[target], next[index]];

    const formData = new FormData();
    formData.set("imageIds", JSON.stringify(next.map((img) => img.id)));
    const result = await reorderWebsiteImages(null, formData);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    onChange([
      ...images.filter((img) => img.kind !== "gallery"),
      ...next.map((img, position) => ({ ...img, position })),
    ]);
  }

  async function persistAlt(id: string, alt: string) {
    const target = images.find((img) => img.id === id);
    if (!target || alt === target.alt) return;
    const supabase = createClient();
    const { error } = await supabase.from("website_images").update({ alt }).eq("id", id);
    if (error) toast.error("Could not save the description: " + error.message);
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        aria-label="Upload gallery photos"
        className="hidden"
        onChange={(event) => void handleFiles(Array.from(event.target.files ?? []))}
      />

      {gallery.length === 0 ? (
        <div onDragLeave={() => setDragging(false)}>
          <DropZone
            dragging={dragging}
            uploading={uploading}
            label={uploading ? progress || "Uploading…" : "Click or drop photos here"}
            hint="PNG, JPEG, WebP or GIF — up to 5 MB each"
            onFiles={(files) => void handleFiles(files)}
          />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-text-secondary">
              {gallery.length} of {GALLERY_MAX} photo{gallery.length === 1 ? "" : "s"}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || room <= 0}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus data-icon="inline-start" />
              Add photos
            </Button>
          </div>

          {uploading ? (
            <p className="flex items-center gap-2 text-xs font-medium text-primary">
              <Spinner size="sm" /> {progress || "Uploading…"}
            </p>
          ) : null}

          <ul className="grid grid-cols-3 gap-2">
            {gallery.map((img, index) => (
              <li
                key={img.id}
                className="group relative aspect-square overflow-hidden rounded-control border border-text-muted/20"
              >
                <Image
                  src={img.url}
                  alt={img.alt}
                  fill
                  sizes="110px"
                  className="object-cover"
                />
                <div className="absolute end-1 top-1 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    aria-label={`Delete photo ${index + 1}`}
                    onClick={() => void handleDelete(img.id)}
                    className="size-6"
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="absolute bottom-1 start-1 end-1 flex justify-between gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label={`Move photo ${index + 1} earlier`}
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                    className="size-6 bg-white/90 text-text-primary hover:bg-white"
                  >
                    <ArrowLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label={`Move photo ${index + 1} later`}
                    disabled={index === gallery.length - 1}
                    onClick={() => void move(index, 1)}
                    className="size-6 bg-white/90 text-text-primary hover:bg-white"
                  >
                    <ArrowRight />
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === img.id ? null : img.id)}
                  aria-expanded={expanded === img.id}
                  className="absolute inset-x-0 bottom-0 bg-secondary/80 px-1 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  Describe
                </button>
              </li>
            ))}
          </ul>

          {expanded
            ? (() => {
                const target = gallery.find((img) => img.id === expanded);
                if (!target) return null;
                return (
                  <div className="rounded-control border border-text-muted/25 bg-app/60 p-3">
                    <TextField
                      label={`Description for photo ${gallery.indexOf(target) + 1}`}
                      value={target.alt}
                      onChange={(value) =>
                        onChange(
                          images.map((img) =>
                            img.id === target.id ? { ...img, alt: value } : img,
                          ),
                        )
                      }
                      onBlur={(value) => void persistAlt(target.id, value)}
                      maxLength={200}
                      hint="Read aloud by screen readers and used by search engines."
                    />
                  </div>
                );
              })()
            : null}
        </>
      )}
    </div>
  );
}

/** All three image pickers, stacked. */
export function ImageManager({
  clinicId,
  images,
  onChange,
}: {
  clinicId: string;
  images: WebsiteImage[];
  onChange: (next: WebsiteImage[]) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <SingleImage
        kind="hero"
        label="Hero banner"
        hint="The figure on the hero's right, shown as-is with no box behind it. A doctor cut out on a transparent background works best — portrait 4:5, about 1200x1500px."
        images={images}
        clinicId={clinicId}
        onChange={onChange}
      />
      <SingleImage
        kind="doctor"
        label="Clinic portrait"
        hint="Shown next to your biography. A portrait of the doctor or the team."
        images={images}
        clinicId={clinicId}
        onChange={onChange}
      />
      <GalleryEditor images={images} clinicId={clinicId} onChange={onChange} />
      <p className="text-[11px] leading-relaxed text-text-muted">
        Photos upload straight to your clinic&apos;s private storage. Nothing here is
        shared with other clinics.
      </p>
    </div>
  );
}