"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import type { WebsiteConfig, WebsiteTheme, WebsiteSectionConfig } from "@/types/website";
import type { WebsiteImage } from "@/types/database";
import {
  addWebsiteImage,
  deleteWebsiteImage,
  reorderWebsiteImages,
} from "@/lib/actions/website";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dispatch = React.Dispatch<any>;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `"${file.name}" is not a supported image (use PNG, JPEG, WebP or GIF).`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `"${file.name}" is larger than 5 MB.`;
  }
  return null;
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

function IconReplace() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356m0 4.992-3.181-3.183a8.25 8.25 0 0 0-13.803 3.7M2.031 12.73v4.99m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function IconPhoto() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M18 6h.008v.008H18V6Zm2.25 12H3.75A1.5 1.5 0 0 1 2.25 16.5v-9A1.5 1.5 0 0 1 3.75 6h13.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5Z" />
    </svg>
  );
}

async function uploadWebsiteFile(
  clinicId: string,
  prefix: string,
  file: File,
): Promise<string> {
  const supabase = createClient();
  const fileExt = file.name.split(".").pop() || "jpg";
  // Storage RLS requires the first path segment to be the clinic id.
  const fileName = `${clinicId}/${prefix}-${Date.now()}.${fileExt}`;
  const { error: uploadError } = await supabase.storage
    .from("website-images")
    .upload(fileName, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage
    .from("website-images")
    .getPublicUrl(fileName);
  return urlData.publicUrl;
}

type Props = {
  clinicId: string;
  config: WebsiteConfig;
  images: WebsiteImage[];
  clinicName: string;
  clinicDoctorName: string | null;
  clinicPhone: string | null;
  clinicEmail: string | null;
  clinicAddress: string | null;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    price: number;
    status: string;
  }>;
  availabilityRules: Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    enabled: boolean;
  }>;
  dispatch: Dispatch;
};

function SectionToggle({
  section,
  onToggle,
  onOpen,
  isOpen,
}: {
  section: WebsiteSectionConfig;
  onToggle: () => void;
  onOpen: () => void;
  isOpen: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onOpen}
        className="flex flex-1 items-center justify-between rounded-md border bg-white px-3 py-2 text-sm transition hover:bg-slate-50"
      >
        <span className="font-medium text-slate-700">{section.label}</span>
        <span className="text-slate-400">{isOpen ? "\u2212" : "+"}</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={
          section.visible
            ? `Hide ${section.label} section`
            : `Show ${section.label} section`
        }
        aria-pressed={section.visible}
        className={`flex h-6 w-10 flex-shrink-0 items-center rounded-full transition-colors ${
          section.visible ? "bg-teal-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            section.visible ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  multiline,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}) {
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
    />
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
      />
      {label}
    </label>
  );
}

/**
 * Single-image picker used for hero banners and the doctor portrait.
 * Supports click-to-browse AND drag-and-drop (with the button as the
 * single-pointer alternative), client-side validation, uploading state,
 * live preview, replace and remove.
 */
function SingleImageEditor({
  kind,
  label,
  images,
  clinicId,
  dispatch,
}: {
  kind: "hero" | "doctor";
  label: string;
  images: WebsiteImage[];
  clinicId: string;
  dispatch: Dispatch;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [alt, setAlt] = useState("");
  const current = images.find((img) => img.kind === kind) ?? null;

  async function handleFile(file: File) {
    const invalid = validateImageFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadWebsiteFile(clinicId, kind, file);
      // Only one image of each kind is rendered — replace any existing record.
      for (const existing of images.filter((img) => img.kind === kind)) {
        await deleteWebsiteImage(null, existing.id);
      }
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("alt", alt);
      fd.set("url", url);
      const result = await addWebsiteImage(null, fd);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Image uploaded.");
      dispatch({
        type: "SET_IMAGES",
        images: [...images.filter((img) => img.kind !== kind), result.data],
      });
      setAlt("");
    } catch (err) {
      toast.error(
        "Upload failed: " + (err instanceof Error ? err.message : "Unknown error"),
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const handleRemove = async () => {
    if (!current) return;
    const result = await deleteWebsiteImage(null, current.id);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Image removed.");
    dispatch({
      type: "SET_IMAGES",
      images: images.filter((img) => img.id !== current.id),
    });
  };

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && !uploading) handleFile(file);
    },
  };

  return (
    <FieldGroup label={label}>
      {current ? (
        <div
          {...dropHandlers}
          className={`group relative h-32 w-full overflow-hidden rounded-md border transition-colors ${
            dragOver ? "border-teal-500 ring-2 ring-teal-200" : "border-slate-200"
          }`}
        >
          <Image
            src={current.url}
            alt={current.alt || label}
            fill
            sizes="384px"
            className="object-cover"
          />
          {/* Top-corner action icons — always visible on touch, on hover for pointer devices. */}
          <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-100 transition focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label={`Replace ${label.toLowerCase()}`}
              title="Replace image"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow transition hover:bg-white disabled:opacity-50"
            >
              <IconReplace />
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              aria-label={`Remove ${label.toLowerCase()}`}
              title="Remove image"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-red-600 shadow transition hover:bg-white disabled:opacity-50"
            >
              <IconTrash />
            </button>
          </div>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white/70 text-xs font-medium text-slate-600">
              <Spinner /> Uploading...
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={`flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 py-4 text-xs font-medium transition disabled:opacity-50 ${
            dragOver
              ? "border-teal-500 bg-teal-50 text-teal-700"
              : "border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {uploading ? (
            <>
              <Spinner /> Uploading...
            </>
          ) : (
            <>
              <IconPhoto /> Click or drag &amp; drop to upload {label.toLowerCase()}
            </>
          )}
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="hidden"
      />
      <TextInput value={alt} onChange={setAlt} placeholder="Alt text (describes the image)" />
    </FieldGroup>
  );
}

function HeroEditor({
  hero,
  images,
  clinicId,
  onChange,
  dispatch,
}: {
  hero: WebsiteConfig["content"]["hero"];
  images: WebsiteImage[];
  clinicId: string;
  onChange: (h: WebsiteConfig["content"]["hero"]) => void;
  dispatch: Dispatch;
}) {
  return (
    <div className="space-y-4">
      <FieldGroup label="Headline">
        <TextInput value={hero.headline} onChange={(v) => onChange({ ...hero, headline: v })} placeholder="Welcome to Our Clinic" />
      </FieldGroup>
      <FieldGroup label="Description">
        <TextInput value={hero.description} onChange={(v) => onChange({ ...hero, description: v })} placeholder="Quality healthcare for you and your family" multiline />
      </FieldGroup>
      <SingleImageEditor
        kind="hero"
        label="Banner image"
        images={images}
        clinicId={clinicId}
        dispatch={dispatch}
      />
      <FieldGroup label="CTA Button Text">
        <TextInput value={hero.ctaText} onChange={(v) => onChange({ ...hero, ctaText: v })} placeholder="Book an Appointment" />
      </FieldGroup>
      <FieldGroup label="Primary CTA URL (leave empty to open AI widget)">
        <TextInput value={hero.ctaUrl} onChange={(v) => onChange({ ...hero, ctaUrl: v })} placeholder="/widget/clinic-slug" />
      </FieldGroup>
      <FieldGroup label="Secondary CTA Text (calls your clinic phone)">
        <TextInput
          value={hero.ctaSecondaryLabel || ""}
          onChange={(v) => onChange({ ...hero, ctaSecondaryLabel: v })}
          placeholder="Call Us"
        />
      </FieldGroup>
    </div>
  );
}

function AboutEditor({
  about,
  images,
  clinicId,
  onChange,
  dispatch,
}: {
  about: WebsiteConfig["content"]["about"];
  images: WebsiteImage[];
  clinicId: string;
  onChange: (a: WebsiteConfig["content"]["about"]) => void;
  dispatch: Dispatch;
}) {
  const [certInput, setCertInput] = useState("");
  const certifications = about.certifications ?? [];

  const addCertification = () => {
    const value = certInput.trim().slice(0, 120);
    if (!value) return;
    if (certifications.length >= 20) {
      toast.error("At most 20 certifications are allowed.");
      return;
    }
    if (certifications.some((c) => c.toLowerCase() === value.toLowerCase())) {
      toast.error("That certification is already listed.");
      return;
    }
    onChange({ ...about, certifications: [...certifications, value] });
    setCertInput("");
  };

  const removeCertification = (index: number) => {
    onChange({
      ...about,
      certifications: certifications.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-4">
      <SingleImageEditor
        kind="doctor"
        label="Doctor portrait"
        images={images}
        clinicId={clinicId}
        dispatch={dispatch}
      />
      <FieldGroup label="Biography">
        <TextInput value={about.bio} onChange={(v) => onChange({ ...about, bio: v })} placeholder="Dr. Smith has over 15 years of experience..." multiline rows={5} />
      </FieldGroup>
      <FieldGroup label="Credentials">
        <TextInput value={about.credentials} onChange={(v) => onChange({ ...about, credentials: v })} placeholder="MD, Board Certified in Family Medicine" multiline rows={3} />
      </FieldGroup>
      <FieldGroup label="Certifications">
        <div className="flex gap-2">
          <input
            type="text"
            value={certInput}
            onChange={(e) => setCertInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCertification();
              }
            }}
            maxLength={120}
            placeholder="Board Certified, ADA Member..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <button
            type="button"
            onClick={addCertification}
            disabled={!certInput.trim()}
            className="flex-shrink-0 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {certifications.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {certifications.map((cert, index) => (
              <li
                key={`${cert}-${index}`}
                className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-2.5 pr-1 py-0.5 text-xs text-slate-700"
              >
                {cert}
                <button
                  type="button"
                  onClick={() => removeCertification(index)}
                  aria-label={`Remove certification ${cert}`}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-100 hover:text-red-600"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-slate-400">Press Enter or Add to include a certification chip.</p>
      </FieldGroup>
    </div>
  );
}

function ContactEditor({
  contact,
  onChange,
}: {
  contact: WebsiteConfig["content"]["contact"];
  onChange: (c: WebsiteConfig["content"]["contact"]) => void;
}) {
  return (
    <div className="space-y-4">
      <Checkbox checked={contact.showPhone} onChange={(v) => onChange({ ...contact, showPhone: v })} label="Show phone number" />
      <Checkbox checked={contact.showEmail} onChange={(v) => onChange({ ...contact, showEmail: v })} label="Show email" />
      <Checkbox checked={contact.showAddress} onChange={(v) => onChange({ ...contact, showAddress: v })} label="Show address" />
      <Checkbox checked={contact.showHours} onChange={(v) => onChange({ ...contact, showHours: v })} label="Show opening hours (from Availability)" />
      <FieldGroup label="Booking CTA Text">
        <TextInput value={contact.bookingCtaText} onChange={(v) => onChange({ ...contact, bookingCtaText: v })} placeholder="Book Now" />
      </FieldGroup>
      <FieldGroup label="Google Maps embed URL">
        <TextInput
          value={contact.mapEmbedUrl || ""}
          onChange={(v) => onChange({ ...contact, mapEmbedUrl: v })}
          placeholder="https://www.google.com/maps/embed?pb=..."
        />
        <p className="text-[11px] text-slate-400">
          In Google Maps: share your location → Embed a map → copy the src URL.
        </p>
      </FieldGroup>
    </div>
  );
}

function ThemeEditor({
  theme,
  onChange,
}: {
  theme: WebsiteTheme;
  onChange: (t: WebsiteTheme) => void;
}) {
  return (
    <div className="space-y-4">
      <FieldGroup label="Primary Color">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={theme.primaryColor}
            onChange={(e) => onChange({ ...theme, primaryColor: e.target.value })}
            className="h-9 w-9 cursor-pointer rounded border-0 p-0"
          />
          <TextInput value={theme.primaryColor} onChange={(v) => onChange({ ...theme, primaryColor: v })} placeholder="#0D9488" />
        </div>
      </FieldGroup>
      <FieldGroup label="Font Family">
        <select
          value={theme.fontFamily}
          onChange={(e) => onChange({ ...theme, fontFamily: e.target.value })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="Inter">Inter</option>
          <option value="system-ui">System UI</option>
          <option value="Georgia">Georgia (Serif)</option>
          <option value="Arial">Arial</option>
        </select>
      </FieldGroup>
    </div>
  );
}

function GalleryEditor({
  images,
  clinicId,
  dispatch,
}: {
  images: WebsiteImage[];
  clinicId: string;
  dispatch: Dispatch;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // Per-file validation: reject only the invalid files, upload the rest.
  const handleFiles = async (incoming: File[]) => {
    if (uploading || incoming.length === 0) return;
    const rejected: string[] = [];
    const valid = incoming.filter((f) => {
      const error = validateImageFile(f);
      if (error) {
        rejected.push(f.name);
        return false;
      }
      return true;
    });
    if (rejected.length > 0) {
      toast.error(`Rejected ${rejected.length} file(s) — images only, max 5 MB each: ${rejected.join(", ")}`);
    }
    if (valid.length === 0) return;

    setUploading(true);
    try {
      let uploadedCount = 0;
      const newImages: WebsiteImage[] = [];
      let currentImages = images;
      for (const file of valid) {
        uploadedCount += 1;
        setProgress(`Uploading ${uploadedCount}/${valid.length}...`);
        const url = await uploadWebsiteFile(clinicId, "gallery", file);
        const fd = new FormData();
        fd.set("kind", "gallery");
        fd.set("alt", "");
        fd.set("url", url);
        const result = await addWebsiteImage(null, fd);
        if (!result.ok) {
          toast.error(result.message);
          continue;
        }
        newImages.push(result.data);
        currentImages = [...currentImages, result.data];
      }
      if (newImages.length > 0) {
        toast.success(`${newImages.length} image(s) uploaded.`);
        dispatch({ type: "SET_IMAGES", images: currentImages });
      }
    } catch (err) {
      toast.error("Upload failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setUploading(false);
      setProgress("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (imageId: string) => {
    const result = await deleteWebsiteImage(null, imageId);
    if (!result.ok) toast.error(result.message);
    else {
      toast.success("Image deleted.");
      dispatch({
        type: "SET_IMAGES",
        images: images.filter((img) => img.id !== imageId),
      });
    }
  };

  // Reorder with explicit buttons (WCAG 2.2: dragging is never the only way).
  const move = async (index: number, dir: -1 | 1) => {
    const next = [...galleryImages];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    const orderedIds = next.map((img) => img.id);
    const fd = new FormData();
    fd.set("imageIds", JSON.stringify(orderedIds));
    const result = await reorderWebsiteImages(null, fd);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const others = images.filter((img) => img.kind !== "gallery");
    dispatch({
      type: "SET_IMAGES",
      images: [...others, ...next.map((img, pos) => ({ ...img, position: pos }))],
    });
  };

  const galleryImages = images.filter((img) => img.kind === "gallery").sort((a, b) => a.position - b.position);

  return (
    <div
      className={`space-y-3 rounded-md transition-colors ${
        dragOver ? "ring-2 ring-teal-300" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(Array.from(e.dataTransfer.files ?? []));
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
        className="hidden"
      />
      {galleryImages.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-6 text-xs font-medium transition disabled:opacity-50 ${
            dragOver
              ? "border-teal-500 bg-teal-50 text-teal-700"
              : "border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {uploading ? (
            <>
              <Spinner className="h-5 w-5" /> {progress || "Uploading..."}
            </>
          ) : (
            <>
              <IconPhoto />
              Click or drag &amp; drop images to upload
              <span className="text-[11px] font-normal text-slate-400">PNG, JPEG, WebP or GIF — up to 5 MB each</span>
            </>
          )}
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{galleryImages.length} image(s)</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              + Add Images
            </button>
          </div>
          {progress && <p className="text-xs font-medium text-teal-700">{progress}</p>}
          <div className="grid grid-cols-3 gap-2">
            {galleryImages.map((img, index) => (
              <div key={img.id} className="group relative aspect-square overflow-hidden rounded border">
                <Image src={img.url} alt={img.alt} fill sizes="120px" className="object-cover" />
                <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                  <button
                    onClick={() => handleDelete(img.id)}
                    aria-label={`Delete image ${index + 1}`}
                    className="flex h-6 w-6 items-center justify-center rounded bg-red-600 text-white"
                  >
                    <IconTrash />
                  </button>
                </div>
                <div className="absolute bottom-1 left-1 hidden gap-1 group-hover:flex">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move image ${index + 1} earlier`}
                    className="rounded bg-white/90 px-1.5 py-0.5 text-xs text-slate-700 disabled:opacity-40"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === galleryImages.length - 1}
                    aria-label={`Move image ${index + 1} later`}
                    className="rounded bg-white/90 px-1.5 py-0.5 text-xs text-slate-700 disabled:opacity-40"
                  >
                    →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function EditorSidebar({
  clinicId,
  config,
  images,
  clinicName,
  clinicDoctorName,
  clinicPhone,
  clinicEmail,
  clinicAddress,
  services,
  availabilityRules,
  dispatch,
}: Props) {
  const [openSection, setOpenSection] = useState<string | null>("template");
  const toggle = (id: string) => setOpenSection(openSection === id ? null : id);
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-1 p-3">
      {/* Template selector */}
      <button
        onClick={() => toggle("template")}
        className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
      >
        <span>Template</span>
        <span className="text-slate-400">{openSection === "template" ? "\u2212" : "+"}</span>
      </button>
      {openSection === "template" && (
        <div className="space-y-2 px-1 pb-3">
          {(["modern", "classic", "minimal"] as const).map((t) => (
            <button
              key={t}
              onClick={() => dispatch({ type: "SET_TEMPLATE", template: t })}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                config.template === t
                  ? "border-teal-600 bg-teal-50 text-teal-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="font-medium capitalize">{t}</span>
            </button>
          ))}
        </div>
      )}

      {/* Theme */}
      <button
        onClick={() => toggle("theme")}
        className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
      >
        <span>Theme</span>
        <span className="text-slate-400">{openSection === "theme" ? "\u2212" : "+"}</span>
      </button>
      {openSection === "theme" && (
        <div className="px-1 pb-3">
          <ThemeEditor theme={config.theme} onChange={(theme) => dispatch({ type: "SET_THEME", theme })} />
        </div>
      )}

      {/* Sections */}
      <div className="border-t pt-2">
        <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Sections</p>
        {[...config.content.sections]
          .sort((a, b) => a.order - b.order)
          .map((section) => (
            <div key={section.id} className="mb-1 space-y-1">
              <SectionToggle
                section={section}
                isOpen={openSection === section.id}
                onToggle={() => dispatch({ type: "TOGGLE_SECTION", sectionId: section.id })}
                onOpen={() => toggle(section.id)}
              />
              {section.visible && openSection === section.id && (
                <div className="rounded-md border bg-white p-3">
                  {section.id === "hero" && (
                    <HeroEditor
                      hero={config.content.hero}
                      images={images}
                      clinicId={clinicId}
                      onChange={(hero) => dispatch({ type: "SET_HERO", hero })}
                      dispatch={dispatch}
                    />
                  )}
                  {section.id === "about" && (
                    <AboutEditor
                      about={config.content.about}
                      images={images}
                      clinicId={clinicId}
                      onChange={(about) => dispatch({ type: "SET_ABOUT", about })}
                      dispatch={dispatch}
                    />
                  )}
                  {section.id === "services" && (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-500">
                        Services are pulled live from your Services page.{" "}
                        {services.filter((s) => s.status === "active").length} active service(s) will display.
                      </p>
                      <div className="divide-y rounded border text-sm">
                        {services.filter((s) => s.status === "active").map((s) => (
                          <div key={s.id} className="flex justify-between px-3 py-2">
                            <span className="text-slate-700">{s.name}</span>
                            <span className="text-slate-400">{s.duration_minutes}min</span>
                          </div>
                        ))}
                        {services.filter((s) => s.status === "active").length === 0 && (
                          <p className="px-3 py-2 text-xs text-slate-400">No active services yet.</p>
                        )}
                      </div>
                    </div>
                  )}
                  {section.id === "gallery" && (
                    <GalleryEditor images={images} clinicId={clinicId} dispatch={dispatch} />
                  )}
                  {section.id === "contact" && (
                    <ContactEditor contact={config.content.contact} onChange={(contact) => dispatch({ type: "SET_CONTACT", contact })} />
                  )}
                </div>
              )}
            </div>
          ))}
      </div>

      {/* Clinic info reference */}
      <div className="border-t pt-3">
        <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Clinic Info</p>
        <div className="space-y-1 px-3 text-xs text-slate-500">
          <p><span className="font-medium">Name:</span> {clinicName}</p>
          {clinicDoctorName && <p><span className="font-medium">Doctor:</span> {clinicDoctorName}</p>}
          {clinicPhone && <p><span className="font-medium">Phone:</span> {clinicPhone}</p>}
          {clinicEmail && <p><span className="font-medium">Email:</span> {clinicEmail}</p>}
          {clinicAddress && <p><span className="font-medium">Address:</span> {clinicAddress}</p>}
          <p className="mt-2 font-medium">Opening Hours (from Availability):</p>
          {availabilityRules.map((rule) => (
            <div key={rule.day_of_week} className="flex justify-between">
              <span>{dayLabels[rule.day_of_week]}</span>
              <span>
                {rule.enabled ? `${rule.start_time.slice(0, 5)} - ${rule.end_time.slice(0, 5)}` : "Closed"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
