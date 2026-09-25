"use server";

import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import {
  websiteSaveSchema,
  websitePublishSchema,
  websiteImageSchema,
  websiteImageReorderSchema,
} from "@/lib/validation/schemas";
import { createDefaultConfig } from "@/types/website";
import type { ActionResult } from "@/types";
import type { Website, WebsiteImage, WebsiteStatus } from "@/types/database";
import type { WebsiteConfig } from "@/types/website";

// ---------------------------------------------------------------------------
// Read / bootstrap
// ---------------------------------------------------------------------------

/**
 * Get or create the website row for the current clinic. Returns the website
 * data plus the parsed config object ready for the editor. If no website
 * exists yet, one is created with defaults.
 */
export async function getOrCreateWebsite(): Promise<
  ActionResult<{
    website: Website;
    images: WebsiteImage[];
    config: WebsiteConfig;
  }>
> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to manage a website." };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can manage the website.",
    };
  }

  // Try to fetch existing website
  const { data: existing } = await supabase
    .from("websites")
    .select("*")
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  let website: Website;

  if (existing) {
    website = existing;
  } else {
    // Create with default config using the clinic slug
    const defaults = createDefaultConfig();
    const { data: created, error } = await supabase
      .from("websites")
      .insert({
        clinic_id: access.clinic.id,
        slug: access.clinic.slug,
        template: "modern",
        content_json: defaults.content as Record<string, unknown>,
        theme_json: defaults.theme as Record<string, unknown>,
      })
      .select()
      .single();

    if (error) {
      return { ok: false, message: "Failed to create website: " + error.message };
    }
    website = created;
  }

  // Fetch images
  const { data: images } = await supabase
    .from("website_images")
    .select("*")
    .eq("website_id", website.id)
    .order("position", { ascending: true });

  // Parse config from JSON columns
  const config: WebsiteConfig = {
    template: website.template,
    content: website.content_json as unknown as WebsiteConfig["content"],
    theme: website.theme_json as unknown as WebsiteConfig["theme"],
  };

  return {
    ok: true,
    data: {
      website,
      images: images ?? [],
      config,
    },
  };
}

// ---------------------------------------------------------------------------
// Save content / template / theme
// ---------------------------------------------------------------------------

/**
 * Save the full website configuration. Called on explicit save from the editor.
 * Validates all input with Zod before persisting.
 */
export async function saveWebsite(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = {
    template: formData.get("template"),
    content: JSON.parse((formData.get("content") as string) || "{}"),
    theme: JSON.parse((formData.get("theme") as string) || "{}"),
  };

  const parsed = websiteSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid website data.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to save a website." };
  }
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can edit the website." };
  }

  // Fetch existing or create
  const { data: existing } = await supabase
    .from("websites")
    .select("id")
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("websites")
      .update({
        template: parsed.data.template,
        content_json: parsed.data.content as unknown as Record<string, unknown>,
        theme_json: parsed.data.theme as unknown as Record<string, unknown>,
      })
      .eq("id", existing.id);

    if (error) {
      return { ok: false, message: "Failed to save: " + error.message };
    }
  } else {
    const { error } = await supabase.from("websites").insert({
      clinic_id: access.clinic.id,
      slug: access.clinic.slug,
      template: parsed.data.template,
      content_json: parsed.data.content as unknown as Record<string, unknown>,
      theme_json: parsed.data.theme as unknown as Record<string, unknown>,
    });

    if (error) {
      return { ok: false, message: "Failed to create: " + error.message };
    }
  }

  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Publish / unpublish
// ---------------------------------------------------------------------------

/**
 * Change the website's publish status. When publishing, sets published_at
 * and ensures the slug is unique among published sites.
 */
export async function publishWebsite(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = websitePublishSchema.safeParse({
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid status.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to publish." };
  }
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can publish." };
  }

  const { data: website } = await supabase
    .from("websites")
    .select("id, slug, status")
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  if (!website) {
    return { ok: false, message: "No website found. Save content first." };
  }

  // If publishing, check slug uniqueness among published sites
  if (parsed.data.status === "published") {
    const { data: conflict } = await supabase
      .from("websites")
      .select("id")
      .eq("slug", website.slug)
      .eq("status", "published")
      .neq("id", website.id)
      .maybeSingle();

    if (conflict) {
      return {
        ok: false,
        message:
          "This URL slug is already used by another published website. Change the clinic slug in Settings first.",
      };
    }
  }

  const updatePayload: {
    status: WebsiteStatus;
    published_at: string | null;
  } = {
    status: parsed.data.status as WebsiteStatus,
    published_at: parsed.data.status === "published" ? new Date().toISOString() : null,
  };

  const { error } = await supabase
    .from("websites")
    .update(updatePayload)
    .eq("id", website.id);

  if (error) {
    return { ok: false, message: "Failed to update status: " + error.message };
  }

  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Image management
// ---------------------------------------------------------------------------

/**
 * Add an image record after the file has been uploaded to Supabase Storage
 * by the client. The client uploads the file and passes back the public URL.
 * Returns the inserted row so the editor can update its state without a
 * full page reload.
 */
export async function addWebsiteImage(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<WebsiteImage>> {
  const parsed = websiteImageSchema.safeParse({
    kind: formData.get("kind"),
    alt: formData.get("alt") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid image data.",
    };
  }

  const url = formData.get("url") as string;
  if (!url || typeof url !== "string") {
    return { ok: false, message: "Image URL is required." };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic." };
  }
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can manage images." };
  }

  // Get website
  const { data: website } = await supabase
    .from("websites")
    .select("id")
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  if (!website) {
    return { ok: false, message: "No website found. Save content first." };
  }

  // Get next position
  const { data: existing } = await supabase
    .from("website_images")
    .select("position")
    .eq("website_id", website.id)
    .eq("kind", parsed.data.kind)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data: image, error } = await supabase
    .from("website_images")
    .insert({
      website_id: website.id,
      clinic_id: access.clinic.id,
      kind: parsed.data.kind,
      url,
      alt: parsed.data.alt || "",
      position: nextPosition,
    })
    .select()
    .single();

  if (error || !image) {
    return { ok: false, message: "Failed to add image: " + (error?.message ?? "unknown error") };
  }

  return { ok: true, data: image };
}

/** Delete an image record and its storage file. */
export async function deleteWebsiteImage(
  _prevState: ActionResult | null,
  imageId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic." };
  }
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can delete images." };
  }

  // Fetch the image to get the storage path
  const { data: image } = await supabase
    .from("website_images")
    .select("id, url, clinic_id")
    .eq("id", imageId)
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  if (!image) {
    return { ok: false, message: "Image not found." };
  }

  // Extract storage path from URL (everything after the bucket public URL)
  const bucketUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/website-images/`;
  const storagePath = image.url.startsWith(bucketUrl)
    ? image.url.slice(bucketUrl.length)
    : null;

  // Delete from storage if we have a valid path
  if (storagePath) {
    await supabase.storage.from("website-images").remove([storagePath]);
  }

  // Delete the record
  const { error } = await supabase
    .from("website_images")
    .delete()
    .eq("id", imageId);

  if (error) {
    return { ok: false, message: "Failed to delete image: " + error.message };
  }

  return { ok: true, data: undefined };
}

/** Reorder images within a kind (hero or gallery). */
export async function reorderWebsiteImages(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = { imageIds: JSON.parse((formData.get("imageIds") as string) || "[]") };
  const parsed = websiteImageReorderSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid reorder data.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic." };
  }
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can reorder images." };
  }

  // Update positions in a batch
  const updates = parsed.data.imageIds.map((id, index) =>
    supabase
      .from("website_images")
      .update({ position: index })
      .eq("id", id)
      .eq("clinic_id", access.clinic.id),
  );

  const results = await Promise.all(updates);
  const firstError = results.find((r) => r.error);
  if (firstError?.error) {
    return { ok: false, message: "Failed to reorder: " + firstError.error.message };
  }

  return { ok: true, data: undefined };
}
