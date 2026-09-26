"use server";

/**
 * Growth Agent server actions (Phase 24).
 *
 * Every action follows the same three steps, in this order, and the order is
 * the security model:
 *
 *   1. Resolve the clinic from the signed-in user's own membership.
 *   2. Check the role — `canWriteClinic` for anything that changes state.
 *   3. Validate the input with Zod.
 *
 * Only then does anything touch the database. No action accepts a `clinicId`
 * from the client: the tenant is always derived server-side, so a crafted
 * request cannot name a clinic the caller does not belong to. RLS is the
 * backstop, not the primary control.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  generateGrowthPost,
  suggestGrowthKeywords,
  type GrowthPostFailure,
  type GrowthTone,
} from "@/lib/ai/growth-post";
import { canWriteClinic, getCurrentClinic, type CurrentClinicAccess } from "@/lib/clinic-access";
import {
  countByStatus,
  fetchGrowthMetricSummaries,
  fetchGrowthPosts,
  fetchGrowthServiceNames,
  fetchGrowthSettings,
} from "@/lib/growth-agent-queries";
import { createClient } from "@/lib/supabase/server";
import { clinicLocalToUtcIso } from "@/lib/time";
import type { ActionResult } from "@/types";
import type { Database, GrowthPost, GrowthPostStatus } from "@/types/database";
import {
  growthGenerateSchema,
  growthPostActionSchema,
  growthPostSaveSchema,
  growthSettingsSchema,
} from "@/lib/validation/schemas";

/**
 * Authorisation result. An explicit discriminated union rather than an
 * optional-`error` object, so the narrowing is checked by the compiler instead
 * of inferred — a missing `message` here would otherwise be a runtime
 * `undefined` in a user-facing error string.
 */
type GrowthAuth =
  | { ok: true; supabase: SupabaseClient<Database>; access: CurrentClinicAccess }
  | { ok: false; message: string };

/**
 * Resolve clinic + assert write access. Returns the Supabase client and the
 * clinic id together so no caller can accidentally use one without the other.
 */
async function requireGrowthWriteAccess(): Promise<GrowthAuth> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You need a clinic before you can use the Growth Agent." };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can change Growth Agent settings and posts.",
    };
  }
  return { ok: true, supabase, access };
}

/** Resolve clinic + assert read access. Staff may read the queue and metrics. */
async function requireGrowthReadAccess(): Promise<GrowthAuth> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You need a clinic before you can use the Growth Agent." };
  }
  return { ok: true, supabase, access };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export type GrowthAgentSnapshot = {
  settings: Awaited<ReturnType<typeof fetchGrowthSettings>>;
  posts: GrowthPost[];
  statusCounts: ReturnType<typeof countByStatus>;
  summaries: Awaited<ReturnType<typeof fetchGrowthMetricSummaries>>["summaries"];
  hasAnyMetrics: boolean;
  serviceNames: string[];
  /**
   * The clinic's real listing details, for the post preview. Read from the
   * clinic row the membership already resolved — the preview shows the clinic
   * the person is actually looking at, not a placeholder name.
   */
  clinic: {
    name: string;
    address: string | null;
    phone: string | null;
  };
  /** False for staff, who can read but not change anything. */
  canEdit: boolean;
};

/** Everything the Growth Agent page needs, in one round trip. */
export async function getGrowthAgentData(): Promise<
  ActionResult<GrowthAgentSnapshot>
> {
  const auth = await requireGrowthReadAccess();
  if (!auth.ok) return { ok: false, message: auth.message };

  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const [settings, posts, metrics, serviceNames] = await Promise.all([
    fetchGrowthSettings(supabase, clinicId),
    fetchGrowthPosts(supabase, clinicId),
    fetchGrowthMetricSummaries(supabase, clinicId, access.clinic.timezone),
    fetchGrowthServiceNames(supabase, clinicId),
  ]);

  return {
    ok: true,
    data: {
      settings,
      posts,
      statusCounts: countByStatus(posts),
      summaries: metrics.summaries,
      hasAnyMetrics: metrics.hasAnyData,
      serviceNames,
      clinic: {
        name: access.clinic.name,
        address: access.clinic.address,
        phone: access.clinic.phone,
      },
      canEdit: canWriteClinic(access.role),
    },
  };
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

export type GrowthGenerateResult = {
  content: string;
  topic: string;
  keywords: string[];
  cta: string;
  tone: string;
};

/**
 * Generate a post body and save it as a draft in the queue.
 *
 * Generation and persistence are one action on purpose: a draft the model
 * produced but that was never stored is a draft the clinic cannot come back to
 * after a refresh, which is how generated marketing copy gets lost.
 */
export async function generateGrowthDraft(
  _prev: ActionResult<GrowthGenerateResult> | null,
  formData: FormData,
): Promise<ActionResult<GrowthGenerateResult>> {
  const auth = await requireGrowthWriteAccess();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;

  const parsed = growthGenerateSchema.safeParse({
    topic: formData.get("topic"),
    keywords: parseKeywords(formData.get("keywords")),
    tone: formData.get("tone"),
    cta: formData.get("cta"),
  });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const tone = parsed.data.tone as GrowthTone;

  const result = await generateGrowthPost({
    clinic: {
      name: access.clinic.name,
      doctorName: access.clinic.doctor_name,
      address: access.clinic.address,
      phone: access.clinic.phone,
      services: await fetchGrowthServiceNames(supabase, access.clinic.id),
    },
    topic: parsed.data.topic,
    keywords: parsed.data.keywords,
    tone,
    clinicId: access.clinic.id,
  });

  if (!result.ok) {
    return { ok: false, message: generationFailureMessage(result) };
  }

  const { data: userData } = await supabase.auth.getUser();

  const { data: post, error } = await supabase
    .from("growth_posts")
    .insert({
      clinic_id: access.clinic.id,
      content: result.content,
      topic: parsed.data.topic,
      keywords: parsed.data.keywords,
      cta: parsed.data.cta,
      tone,
      status: "draft",
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error || !post) {
    return {
      ok: false,
      message: `The post was written but could not be saved: ${error?.message ?? "unknown error"}`,
    };
  }

  revalidatePath("/app/growth-agent");
  return {
    ok: true,
    data: {
      content: post.content,
      topic: post.topic,
      keywords: post.keywords,
      cta: post.cta,
      tone: post.tone,
    },
  };
}

/** Keyword suggestions derived from the clinic's real services and address. */
export async function getGrowthKeywordSuggestions(): Promise<
  ActionResult<{ keywords: string[] }>
> {
  const auth = await requireGrowthReadAccess();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;

  const services = await fetchGrowthServiceNames(supabase, access.clinic.id);
  return {
    ok: true,
    data: {
      keywords: suggestGrowthKeywords({
        name: access.clinic.name,
        address: access.clinic.address,
        services,
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Edit / publish / delete
// ---------------------------------------------------------------------------

/** Create or update a draft, optionally scheduling it. */
export async function saveGrowthPost(
  _prev: ActionResult<GrowthPost> | null,
  formData: FormData,
): Promise<ActionResult<GrowthPost>> {
  const auth = await requireGrowthWriteAccess();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;

  const rawId = formData.get("postId");
  const parsed = growthPostSaveSchema.safeParse({
    postId: typeof rawId === "string" && rawId ? rawId : undefined,
    content: formData.get("content"),
    topic: formData.get("topic"),
    keywords: parseKeywords(formData.get("keywords")),
    cta: formData.get("cta"),
    tone: formData.get("tone"),
    scheduledFor: formData.get("scheduledFor") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  // The naive clinic-local value becomes a UTC instant for `timestamptz`.
  // Leaving it empty means "save as a draft, decide the time later".
  const scheduledAt =
    parsed.data.scheduledFor.length > 0
      ? clinicLocalToUtcIso(parsed.data.scheduledFor, access.clinic.timezone)
      : null;

  const status: GrowthPostStatus = scheduledAt ? "scheduled" : "draft";

  const payload = {
    content: parsed.data.content,
    topic: parsed.data.topic,
    keywords: parsed.data.keywords,
    cta: parsed.data.cta,
    tone: parsed.data.tone,
    status,
    scheduled_at: scheduledAt,
    // Moving a post back to draft/scheduled must clear a previous publish time
    // and any failure detail, or the DB CHECK (failure_reason only on failed
    // rows) rejects the write for a reason the user cannot act on.
    published_at: null,
    failure_reason: null,
  };

  if (parsed.data.postId) {
    const { data, error } = await supabase
      .from("growth_posts")
      .update(payload)
      .eq("id", parsed.data.postId)
      .eq("clinic_id", access.clinic.id)
      .select("*")
      .single();

    if (error || !data) {
      return { ok: false, message: `Could not save the post: ${error?.message ?? "not found"}` };
    }
    revalidatePath("/app/growth-agent");
    return { ok: true, data };
  }

  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("growth_posts")
    .insert({
      ...payload,
      clinic_id: access.clinic.id,
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, message: `Could not save the post: ${error?.message ?? "unknown error"}` };
  }
  revalidatePath("/app/growth-agent");
  return { ok: true, data };
}

/**
 * Move a post to `published`.
 *
 * Without the Google integration there is no API call behind this — the row is
 * marked published and the UI says plainly that it will reach Google once the
 * profile is connected. What this action does NOT do is claim to a human that
 * something happened on Google's servers, because nothing did.
 */
export async function publishGrowthPost(
  postId: string,
): Promise<ActionResult<{ publishedAt: string; willSync: boolean }>> {
  const auth = await requireGrowthWriteAccess();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;

  const parsed = growthPostActionSchema.safeParse({ postId });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const settings = await fetchGrowthSettings(supabase, access.clinic.id);
  const willSync = settings?.connection_state === "connected";

  const { data, error } = await supabase
    .from("growth_posts")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      // Scheduling is consumed by publishing.
      scheduled_at: null,
      failure_reason: null,
    })
    .eq("id", parsed.data.postId)
    .eq("clinic_id", access.clinic.id)
    .select("published_at")
    .single();

  if (error || !data?.published_at) {
    return {
      ok: false,
      message: `Could not publish the post: ${error?.message ?? "not found"}`,
    };
  }

  revalidatePath("/app/growth-agent");
  return { ok: true, data: { publishedAt: data.published_at, willSync } };
}

/** Send a post back to draft so it can be reworked. */
export async function revertGrowthPost(
  postId: string,
): Promise<ActionResult> {
  const auth = await requireGrowthWriteAccess();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;

  const parsed = growthPostActionSchema.safeParse({ postId });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const { error } = await supabase
    .from("growth_posts")
    .update({
      status: "draft",
      published_at: null,
      scheduled_at: null,
      failure_reason: null,
    })
    .eq("id", parsed.data.postId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    return { ok: false, message: `Could not reopen the post: ${error.message}` };
  }
  revalidatePath("/app/growth-agent");
  return { ok: true, data: undefined };
}

export async function deleteGrowthPost(postId: string): Promise<ActionResult> {
  const auth = await requireGrowthWriteAccess();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;

  const parsed = growthPostActionSchema.safeParse({ postId });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const { error } = await supabase
    .from("growth_posts")
    .delete()
    .eq("id", parsed.data.postId)
    .eq("clinic_id", access.clinic.id);

  if (error) {
    return { ok: false, message: `Could not delete the post: ${error.message}` };
  }
  revalidatePath("/app/growth-agent");
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Persist the auto-publishing preferences.
 *
 * `connection_state` is deliberately NOT writable from here. The Google
 * integration owns that column; letting a form set it would mean the UI could
 * put a clinic into "connected" with no connection behind it.
 */
export async function saveGrowthSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireGrowthWriteAccess();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;

  const parsed = growthSettingsSchema.safeParse({
    autoPostEnabled: formData.get("autoPostEnabled") === "true",
    postingFrequency: formData.get("postingFrequency"),
    preferredDay: formData.get("preferredDay"),
    preferredTime: formData.get("preferredTime"),
    requireApproval: formData.get("requireApproval") === "true",
  });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const { error } = await supabase.from("growth_agent_settings").upsert(
    {
      clinic_id: access.clinic.id,
      auto_post_enabled: parsed.data.autoPostEnabled,
      posting_frequency: parsed.data.postingFrequency,
      preferred_day: parsed.data.preferredDay,
      // Postgres `time` wants `HH:MM:SS`; the input gives `HH:MM`.
      preferred_time: `${parsed.data.preferredTime}:00`,
      require_approval: parsed.data.requireApproval,
    },
    { onConflict: "clinic_id" },
  );

  if (error) {
    return { ok: false, message: `Could not save settings: ${error.message}` };
  }

  revalidatePath("/app/growth-agent");
  return { ok: true, data: undefined };
}

/**
 * Record the clinic's Google Business Profile name against the connection.
 *
 * This does not connect anything — it is the step a clinic completes by hand
 * while the OAuth integration is being configured, and it is what the dashboard
 * needs in order to show which profile the posts are aimed at. Kept separate
 * from `saveGrowthSettings` so the automation form can never touch it.
 */
export async function setGrowthLocationName(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireGrowthWriteAccess();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;

  const name = z
    .string()
    .trim()
    .max(120, "Keep the profile name under 120 characters.")
    .safeParse(formData.get("locationName") ?? "");

  if (!name.success) {
    return { ok: false, message: firstIssue(name.error) };
  }

  const { error } = await supabase.from("growth_agent_settings").upsert(
    {
      clinic_id: access.clinic.id,
      google_location_name: name.data.length > 0 ? name.data : null,
    },
    { onConflict: "clinic_id" },
  );

  if (error) {
    return { ok: false, message: `Could not save the profile name: ${error.message}` };
  }

  revalidatePath("/app/growth-agent");
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Keywords arrive as a JSON array string from the tag input. Parsed here rather
 * than in the schema so a malformed payload is a validation message instead of
 * an unhandled `JSON.parse` throw inside a server action.
 */
function parseKeywords(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsedValue: unknown = JSON.parse(raw);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

/** First Zod issue, phrased as an instruction rather than a schema dump. */
function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Some of those values are not valid.";
}

/**
 * Turn a generation failure into something the clinic can act on.
 *
 * The `unauthorised_claim` branch names the phrase that was caught. Telling
 * someone "generation failed" when the real cause is "the draft invented a
 * discount you never offered" wastes their time and teaches them nothing.
 */
function generationFailureMessage(
  result: GrowthPostFailure,
): string {
  switch (result.reason) {
    case "unauthorised_claim":
      return `The draft included "${result.detail}", which is a claim the clinic has not authorised, so it was not saved. Change the topic or add the offer to your brief, then try again.`;
    case "too_short":
      return "The draft came back too short to be useful. Try a more specific topic.";
    case "empty":
      return "The model returned nothing. Try again in a moment.";
    case "error":
    default:
      return "We could not reach the AI service. Check your AI settings and try again.";
  }
}
