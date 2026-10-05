"use server";

import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import {
  websiteSaveSchema,
  websitePublishSchema,
  websiteImageSchema,
  websiteImageReorderSchema,
  websiteDomainSchema,
} from "@/lib/validation/schemas";
import { configFromWebsite, createDefaultConfig, normalizeWebsiteConfig } from "@/types/website";
import type { ActionResult } from "@/types";
import type { Website, WebsiteDomainStatus, WebsiteImage, WebsiteStatus } from "@/types/database";
import type { WebsiteConfig } from "@/types/website";

/**
 * Shape stored in each JSON column, read back through `normalizeWebsiteConfig`.
 * Kept as one helper because all four columns are written together on every
 * save — a partial write is how a clinic ends up with a new theme and a stale
 * widget position.
 */
type WebsiteJsonColumns = {
  content_json: Record<string, unknown>;
  theme_json: Record<string, unknown>;
  widget_json: Record<string, unknown>;
  seo_json: Record<string, unknown>;
  locale_json: Record<string, unknown>;
};

function toJsonColumns(config: WebsiteConfig): WebsiteJsonColumns {
  return {
    content_json: config.content as unknown as Record<string, unknown>,
    theme_json: config.theme as unknown as Record<string, unknown>,
    widget_json: config.widget as unknown as Record<string, unknown>,
    seo_json: config.seo as unknown as Record<string, unknown>,
    locale_json: config.locale as unknown as Record<string, unknown>,
  };
}

/**
 * Turn a PostgREST failure into something a clinic can act on.
 *
 * The builder writes five JSON columns, three of which arrive with migration
 * 0059. On a database where that migration has not been applied yet, PostgREST
 * rejects the whole update with "column websites.widget_json ... does not
 * exist" — which reads like a bug in the builder rather than a missing step,
 * and is exactly the kind of failure that otherwise shows up as a generic
 * "something went wrong" toast.
 */
function describeSaveError(message: string): string {
  const missing = ["widget_json", "seo_json", "locale_json", "doctor_page_slug", "domain_status"].filter(
    (column) => message.includes(column) && message.includes("does not exist"),
  );

  if (missing.length > 0) {
    return (
      `Your database is missing the website columns (${missing.join(", ")}). ` +
      "Apply supabase/migrations/0059_website_builder_domains_seo.sql and try again."
    );
  }

  return "Failed to save: " + message;
}

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
        ...toJsonColumns(defaults),
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

  return {
    ok: true,
    data: {
      website,
      images: images ?? [],
      config: configFromWebsite(website),
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
  // A malformed payload must produce a message naming the field, not a stack
  // trace from JSON.parse. `readJson` turns each column into a value the schema
  // can reject on its own terms.
  const readJson = (key: string): unknown => {
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw === "") return {};
    try {
      return JSON.parse(raw);
    } catch {
      return { __malformed: true };
    }
  };

  const raw = {
    template: formData.get("template"),
    content: readJson("content"),
    theme: readJson("theme"),
    widget: readJson("widget"),
    seo: readJson("seo"),
    locale: readJson("locale"),
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

  // Run the validated payload back through `normalizeWebsiteConfig` rather than
  // casting it. Zod proves the *shape* is safe to store; normalization is what
  // fills in any slot the client legitimately omitted (a partial save from an
  // older client, say) so a row can never end up with a missing `hero` object
  // that the public renderer would dereference on the next request.
  //
  // Order is re-derived from list position. The drag handle is the source of
  // truth in the UI, but the persisted array order is what every renderer
  // reads, so normalizing here means a client that posts a stale `order` cannot
  // scramble the page.
  const config: WebsiteConfig = normalizeWebsiteConfig({
    template: parsed.data.template,
    content: {
      ...parsed.data.content,
      sections: parsed.data.content.sections.map((section, index) => ({
        ...section,
        order: index,
      })),
    },
    theme: parsed.data.theme,
    widget: parsed.data.widget,
    seo: parsed.data.seo,
    locale: parsed.data.locale,
  });

  const columns = toJsonColumns(config);

  // Fetch existing or create
  const { data: existing } = await supabase
    .from("websites")
    .select("id")
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("websites")
      .update({ template: config.template, ...columns })
      .eq("id", existing.id);

    if (error) {
      return { ok: false, message: describeSaveError(error.message) };
    }
  } else {
    const { error } = await supabase.from("websites").insert({
      clinic_id: access.clinic.id,
      slug: access.clinic.slug,
      template: config.template,
      ...columns,
    });

    if (error) {
      return { ok: false, message: describeSaveError(error.message) };
    }
  }

  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Publish / unpublish
// ---------------------------------------------------------------------------

/**
 * Block a publish that would ship an empty page.
 *
 * A clinic clicking Publish on a fresh builder gets a one-line hero and no
 * services — technically valid, and a bad first impression for every patient
 * who finds the site through search. These are the checks that fail, each with a
 * message naming the fix rather than a generic "incomplete".
 */
function publishBlockers(
  config: WebsiteConfig,
  live: { services: number; doctors: number },
): string[] {
  const visible = new Set(
    config.content.sections.filter((s) => s.visible).map((s) => s.id),
  );
  const blockers: string[] = [];

  if (visible.has("hero")) {
    if (!config.content.hero.headline.trim()) {
      blockers.push("Add a headline to the Hero section.");
    }
    if (!config.content.hero.description.trim()) {
      blockers.push("Add a short description to the Hero section.");
    }
  }
  if (visible.has("services") && live.services === 0) {
    blockers.push(
      "The Services section is on but you have no active services. Add one on the Services page, or hide the section.",
    );
  }
  if (visible.has("doctors") && live.doctors === 0) {
    blockers.push(
      "The Doctors section is on but no doctor is marked visible. Add one on the Doctors page, or hide the section.",
    );
  }
  // Nothing on the page asks for an appointment, so nothing converts.
  if (!visible.has("booking") && !config.content.hero.ctaText.trim()) {
    blockers.push(
      "Add a booking button — either turn on the Booking section or give the Hero a call to action.",
    );
  }

  return blockers;
}

/**
 * Change the website's publish status. When publishing, sets published_at,
 * ensures the slug is unique among published sites, and refuses to ship a page
 * that would leave a patient unable to book.
 */
export async function publishWebsite(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ status: WebsiteStatus }>> {
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
    .select("id, slug, status, template, content_json, theme_json, widget_json, seo_json, locale_json")
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

    // Live-data blockers. Two cheap counts; the alternative is publishing a site
    // whose Services block is empty and finding out from the patient.
    const [{ count: serviceCount }, { count: doctorCount }] = await Promise.all([
      supabase
        .from("services")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", access.clinic.id)
        .eq("status", "active"),
      supabase
        .from("doctors")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", access.clinic.id)
        .eq("is_visible", true),
    ]);

    const config = normalizeWebsiteConfig({
      template: website.template,
      content: website.content_json,
      theme: website.theme_json,
      widget: website.widget_json,
      seo: website.seo_json,
      locale: website.locale_json,
    });

    const blockers = publishBlockers(config, {
      services: serviceCount ?? 0,
      doctors: doctorCount ?? 0,
    });

    if (blockers.length > 0) {
      return {
        ok: false,
        message: `Fix these before publishing:\n• ${blockers.join("\n• ")}`,
      };
    }
  }

  const status = parsed.data.status;
  const updatePayload: {
    status: WebsiteStatus;
    published_at: string | null;
  } = {
    status,
    // Only `published` carries a timestamp. Re-publishing refreshes it, and
    // unpublishing clears it so the public route's staleness checks stay honest.
    published_at: status === "published" ? new Date().toISOString() : null,
  };

  const { error } = await supabase
    .from("websites")
    .update(updatePayload)
    .eq("id", website.id);

  if (error) {
    return { ok: false, message: "Failed to update status: " + error.message };
  }

  return { ok: true, data: { status } };
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

// ---------------------------------------------------------------------------
// Custom domain
// ---------------------------------------------------------------------------

/**
 * What the DNS panel needs to look like for a given hostname.
 *
 * Kept server-side so the builder UI and the docs can never disagree about the
 * record name — a CNAME pointed at the wrong host is the single most common
 * reason a custom domain silently never verifies.
 */
function dnsInstructions(domain: string, token: string, apex: string) {
  return {
    cname: [
      { type: "CNAME", name: `www.${domain}`, value: apex },
      { type: "A", name: domain, value: apex },
    ],
    txt: [{ type: "TXT", name: `_clinicflow.${domain}`, value: token }],
  } as const;
}

/** The apex host a custom domain should point at. */
function apexHost(): string {
  return new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ).host;
}

/**
 * Claim a custom domain.
 *
 * A fresh token is minted on every claim rather than reused, so a token that was
 * ever visible in a screenshot or a support thread stops being useful. Status
 * starts at `pending`: nothing here resolves DNS, and claiming a hostname that
 * points somewhere else must not silently take over a live site.
 */
export async function connectWebsiteDomain(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<
  ActionResult<{
    domain: string;
    domain_status: WebsiteDomainStatus;
    token: string;
    records: ReturnType<typeof dnsInstructions>;
  }>
> {
  const parsed = websiteDomainSchema.safeParse({
    domain: formData.get("domain"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter a valid domain.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic." };
  }
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can connect a domain." };
  }

  const domain = parsed.data.domain;

  // Reject a hostname another clinic already owns before touching our own row,
  // so the error names the conflict instead of surfacing a raw unique-index
  // violation from the update.
  const { data: taken } = await supabase
    .from("websites")
    .select("clinic_id")
    .eq("domain", domain)
    .neq("clinic_id", access.clinic.id)
    .maybeSingle();

  if (taken) {
    return {
      ok: false,
      message: `${domain} is already connected to another clinic.`,
    };
  }

  const token = randomVerificationToken();
  const { data: website, error } = await supabase
    .from("websites")
    .update({
      domain,
      domain_status: "pending",
      domain_verification_token: token,
      domain_verified_at: null,
    })
    .eq("clinic_id", access.clinic.id)
    .select("id")
    .maybeSingle();

  if (error || !website) {
    return { ok: false, message: "Failed to save the domain: " + (error?.message ?? "no website") };
  }

  return {
    ok: true,
    data: {
      domain,
      domain_status: "pending",
      token,
      records: dnsInstructions(domain, token, apexHost()),
    },
  };
}

/** Release a custom domain and return the site to its ClinicFlow subdomain. */
export async function disconnectWebsiteDomain(): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic." };
  }
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can disconnect a domain." };
  }

  const { error } = await supabase
    .from("websites")
    .update({
      domain: null,
      domain_status: "none",
      domain_verification_token: null,
      domain_verified_at: null,
    })
    .eq("clinic_id", access.clinic.id);

  if (error) {
    return { ok: false, message: "Failed to disconnect the domain: " + error.message };
  }
  return { ok: true, data: undefined };
}

/**
 * Check whether the verification TXT record now resolves.
 *
 * The lookup is a plain DNS query, which is all that can honestly be claimed
 * from application code — it proves the clinic published the token, not that
 * their nameservers point the hostname at us. That second half is the hosting
 * layer's job, and the UI says so rather than promising SSL from here.
 */
export async function verifyWebsiteDomain(): Promise<
  ActionResult<{ domain: string; domain_status: WebsiteDomainStatus; message: string }>
> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic." };
  }
  if (!canWriteClinic(access.role)) {
    return { ok: false, message: "Only owners and admins can verify a domain." };
  }

  const { data: website } = await supabase
    .from("websites")
    .select("domain, domain_status, domain_verification_token")
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  if (!website?.domain) {
    return { ok: false, message: "Connect a domain first." };
  }
  if (!website.domain_verification_token) {
    return { ok: false, message: "Reconnect the domain to get a fresh verification code." };
  }

  const found = await resolveTxtRecord(
    `_clinicflow.${website.domain}`,
    website.domain_verification_token,
  );

  if (!found) {
    const { error } = await supabase
      .from("websites")
      .update({ domain_status: "failed" })
      .eq("clinic_id", access.clinic.id);

    if (error) {
      return { ok: false, message: "Failed to record the check: " + error.message };
    }
    return {
      ok: true,
      data: {
        domain: website.domain,
        domain_status: "failed",
        message:
          "No matching TXT record found yet. DNS can take up to an hour to update — check the record name and value, then try again.",
      },
    };
  }

  const { error } = await supabase
    .from("websites")
    .update({ domain_status: "verified", domain_verified_at: new Date().toISOString() })
    .eq("clinic_id", access.clinic.id);

  if (error) {
    return { ok: false, message: "Failed to record the check: " + error.message };
  }

  return {
    ok: true,
    data: {
      domain: website.domain,
      domain_status: "verified",
      message:
        "Ownership confirmed. The site will serve on your domain once the hostname is pointed at ClinicFlow.",
    },
  };
}

/** Current domain state for the builder, tolerant of a database without 0059. */
export async function readWebsiteDomain(): Promise<
  ActionResult<{
    domain: string | null;
    domain_status: WebsiteDomainStatus;
    token: string | null;
    records: ReturnType<typeof dnsInstructions> | null;
  }>
> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic." };
  }

  const { data, error } = await supabase
    .from("websites")
    .select("domain, domain_status, domain_verification_token")
    .eq("clinic_id", access.clinic.id)
    .maybeSingle();

  if (error) {
    // 42703 until 0059 is applied. The domain panel is an extra, not a
    // prerequisite, so it degrades to "no domain" instead of failing the build.
    console.warn("[readWebsiteDomain] websites domain columns unavailable", {
      code: error.code,
      message: error.message,
    });
    return {
      ok: true,
      data: { domain: null, domain_status: "none", token: null, records: null },
    };
  }

  const row = data as
    | {
        domain?: string | null;
        domain_status?: WebsiteDomainStatus;
        domain_verification_token?: string | null;
      }
    | null;

  const domain = row?.domain ?? null;
  const token = row?.domain_verification_token ?? null;

  return {
    ok: true,
    data: {
      domain,
      domain_status: row?.domain_status ?? "none",
      token,
      records:
        domain && token ? dnsInstructions(domain, token, apexHost()) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// DNS helpers
// ---------------------------------------------------------------------------

/**
 * 32 lowercase alphanumeric characters. `crypto.randomUUID` would do, but a
 * verification code gets read aloud over the phone and retyped into a DNS
 * panel, so it avoids the glyph pairs that get misread (0/o, 1/l, i/j).
 */
function randomVerificationToken(): string {
  const alphabet = "abcdefghkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

/**
 * Look up the TXT records at `name`.
 *
 * DNS-over-HTTPS rather than `node:dns`: the server action runs on the Node
 * runtime in dev and the edge runtime in production, and only the fetch-based
 * resolver is available in both. A resolver failure is reported as "not found"
 * so the clinic sees the same "wait for DNS" message it would see for a genuine
 * miss, rather than an infrastructure error it cannot act on.
 */
async function resolveTxtRecord(name: string, expected: string): Promise<boolean> {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`,
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/dns-json" },
        // DNS propagation is measured in minutes; do not hold the action open
        // longer than a clinic will sit waiting for a button press.
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) continue;

      const payload = (await response.json()) as {
        Answer?: Array<{ data?: string }>;
      };
      const matches = (payload.Answer ?? []).some((record) =>
        (record.data ?? "").replace(/^"|"$/g, "").includes(expected),
      );
      if (matches) return true;
    } catch {
      // Try the next resolver.
    }
  }

  return false;
}
