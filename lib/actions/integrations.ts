"use server";

/**
 * Integrations server actions (Phase 25, migration 0043).
 *
 * Every action follows the same order, and the order is the security model:
 *
 *   1. Resolve the clinic from the signed-in user's own membership.
 *   2. Check the role — `canWriteClinic` for anything that changes state.
 *   3. Validate the input with Zod.
 *
 * Only then does anything touch the database. No action accepts a `clinicId`
 * from the client, so a crafted request cannot name a clinic the caller does not
 * belong to. RLS is the backstop, not the primary control.
 *
 * ## Credentials
 *
 * API keys are written through `createSecretsClient` (service role) because
 * `clinic_integration_secrets` has no RLS policies and the session client is
 * denied by design. That client bypasses RLS, so it is used only AFTER the
 * membership and role checks above, and only for the secret write itself.
 *
 * Credential values are never returned. The read path reduces them to
 * booleans (`hasCredentials`), which is the only thing the client ever learns
 * about them.
 *
 * ## Plan gating
 *
 * `gcal` and `gmeet` are gated behind a `subscription_plans.features` key that
 * migration 0043 populated. The gate is re-checked here, server-side, before
 * every write — hiding a card is not access control, and a client calling the
 * action directly must be refused exactly as a user who cannot see the button
 * is.
 *
 * ## Honesty about vendor connections
 *
 * Seven of the eight catalogue entries need vendor OAuth credentials that this
 * deployment does not have (see `needsVendorSetup` in the catalogue). Those
 * integrations store configuration and read back as "configured" or "not
 * configured" — never as "connected to Google". `queue` is the one entry that
 * does something real here, and it writes `clinics.appointments_view_mode`,
 * which the appointments page actually reads.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canWriteClinic,
  getCurrentClinic,
  type CurrentClinicAccess,
} from "@/lib/clinic-access";
import { APP_ROUTES, getIntegrationEntry, INTEGRATION_KEYS } from "@/lib/constants";
import { getPlanAccess, isFeatureUnlocked } from "@/lib/plan-features";
import { createClient } from "@/lib/supabase/server";
import { createSecretsClient } from "@/lib/supabase/secrets";
import type { ActionResult } from "@/types";
import type {
  ClinicIntegration,
  Database,
  IntegrationKey,
} from "@/types/database";
import {
  saveIntegrationConfigSchema,
  setAppointmentsViewModeSchema,
  setIntegrationStatusSchema,
} from "@/lib/validation/schemas";

const INTEGRATIONS_PATH = APP_ROUTES.app.integrations;

type IntegrationAuth =
  | {
      ok: true;
      supabase: SupabaseClient<Database>;
      access: CurrentClinicAccess;
    }
  | { ok: false; message: string };

/** Resolve clinic + assert write access. */
async function requireIntegrationWrite(): Promise<IntegrationAuth> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You need a clinic before you can manage integrations.",
    };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can change integrations.",
    };
  }
  return { ok: true, supabase, access };
}

/** Resolve clinic + assert read access. Staff may see which integrations run. */
async function requireIntegrationRead(): Promise<IntegrationAuth> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You need a clinic before you can view integrations.",
    };
  }
  return { ok: true, supabase, access };
}

// ---------------------------------------------------------------------------
// 1. getIntegrationsAction — the dashboard read model
// ---------------------------------------------------------------------------

/**
 * What the client is told about one integration.
 *
 * `hasCredentials` is a boolean derived from whether a secret row exists. The
 * value that row holds is never loaded into a response object, so there is
 * nothing here that a future refactor could accidentally serialise.
 */
export type IntegrationView = {
  key: IntegrationKey;
  status: ClinicIntegration["status"];
  /** Non-secret settings, safe to render into the config modal. */
  config: Record<string, unknown>;
  configuredAt: string | null;
  lastError: string | null;
  /** True when a secret row exists. Says nothing about its contents. */
  hasCredentials: boolean;
  /** False when the clinic's plan does not include this integration. */
  unlocked: boolean;
  /** Plan names that include it, for the "Available on …" line when locked. */
  availableOn: string[];
};

export type IntegrationsSnapshot = {
  integrations: IntegrationView[];
  /** Queue Management is stored on `clinics`, so it reports separately. */
  appointmentsViewMode: "queue" | "list";
  canManage: boolean;
  planName: string | null;
  hasActiveSubscription: boolean;
};

export async function getIntegrationsAction(): Promise<
  ActionResult<IntegrationsSnapshot>
> {
  const auth = await requireIntegrationRead();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  // Queue Management is the one entry backed by a column on `clinics` rather
  // than a `clinic_integrations` row, because the live waiting queue it
  // controls already works. Reading it from the same place that writes it keeps
  // a single source of truth.
  const [rowsResult, access_] = await Promise.all([
    supabase
      .from("clinic_integrations")
      .select("integration_key, status, config, configured_at, last_error, id")
      .eq("clinic_id", clinicId),
    getPlanAccess(supabase, clinicId),
  ]);

  if (rowsResult.error) {
    return { ok: false, message: "Could not load your integrations." };
  }

  const rows = (rowsResult.data ?? []) as Array<Pick<
    ClinicIntegration,
    "integration_key" | "status" | "config" | "configured_at" | "last_error" | "id"
  >>;

  const byKey = new Map(rows.map((r) => [r.integration_key, r]));

  // Which integrations have a secret row. This is a LEFT JOIN on ids the
  // member-readable client is already allowed to see, selecting only `id` — the
  // service role is not needed to learn *that* a credential exists, only to
  // learn its value.
  const ids = rows.map((r) => r.id);
  let credentialOwnerIds = new Set<string>();
  if (ids.length > 0) {
    const secrets = createSecretsClient();
    const { data: secretRows } = await secrets
      .from("clinic_integration_secrets")
      .select("integration_id")
      .in("integration_id", ids);
    credentialOwnerIds = new Set(
      (secretRows ?? []).map((s) => (s as { integration_id: string }).integration_id),
    );
  }

  const gatedKeys = [...new Set(
    // Only one feature key can gate a given entry, so a single pass is enough
    // to know which distinct keys we need plan lookups for.
    ["gcal", "gmeet"]
      .map((k) => getIntegrationEntry(k)?.featureKey)
      .filter((k): k is string => Boolean(k)),
  )];

  const gateByFeatureKey = new Map<string, boolean>();
  const plansByFeatureKey = new Map<string, string[]>();
  for (const featureKey of gatedKeys) {
    const planAccess = await getPlanAccess(supabase, clinicId, featureKey);
    gateByFeatureKey.set(featureKey, isFeatureUnlocked(planAccess, featureKey));
    plansByFeatureKey.set(featureKey, planAccess.plansWithFeature);
  }

  // Build the view for every catalogue entry, defaulting a missing row to
  // `disabled` — "no row" and "not configured" mean the same thing, which is
  // why the table is not seeded eight times per clinic.
  const integrations: IntegrationView[] = [];
  for (const key of INTEGRATION_KEYS) {
    const entry = getIntegrationEntry(key);
    if (!entry) continue;
    if (entry.backedBy === "clinic_setting") continue;

    const row = byKey.get(key);
    const featureKey = entry.featureKey;
    const unlocked = featureKey
      ? (gateByFeatureKey.get(featureKey) ?? false)
      : true;

    integrations.push({
      key: entry.key,
      status: row?.status ?? "disabled",
      config: (row?.config as Record<string, unknown>) ?? {},
      configuredAt: row?.configured_at ?? null,
      lastError: row?.last_error ?? null,
      hasCredentials: row ? credentialOwnerIds.has(row.id) : false,
      unlocked,
      availableOn: featureKey ? (plansByFeatureKey.get(featureKey) ?? []) : [],
    });
  }

  return {
    ok: true,
    data: {
      integrations,
      appointmentsViewMode: access.clinic.appointments_view_mode ?? "queue",
      canManage: canWriteClinic(access.role),
      planName: access_.plan?.name ?? null,
      hasActiveSubscription: access_.hasActiveSubscription,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. setIntegrationStatusAction — the card toggle
// ---------------------------------------------------------------------------

export async function setIntegrationStatusAction(
  input: unknown,
): Promise<ActionResult<{ status: "activated" | "disabled" }>> {
  const auth = await requireIntegrationWrite();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const parsed = setIntegrationStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { key, status } = parsed.data;

  const entry = getIntegrationEntry(key);
  if (!entry) {
    return { ok: false, message: "That integration does not exist." };
  }

  // Queue Management lives on `clinics`, not in a row.
  if (entry.backedBy === "clinic_setting") {
    return {
      ok: false,
      message: "Use the Queue Management setting to change the appointments view.",
    };
  }

  // Server-side plan gate. A locked card hides the control, but the action is
  // the actual boundary.
  if (entry.featureKey) {
    const planAccess = await getPlanAccess(supabase, clinicId, entry.featureKey);
    if (!isFeatureUnlocked(planAccess, entry.featureKey)) {
      return {
        ok: false,
        message: `${entry.name} is not included in your current plan.`,
      };
    }
  }

  // Activating a vendor integration that has never been configured would show an
  // "Active" badge for a connection that does not exist. Require the settings
  // first, and say why.
  if (status === "activated" && entry.fields.length > 0) {
    const { data: existing } = await supabase
      .from("clinic_integrations")
      .select("id, configured_at")
      .eq("clinic_id", clinicId)
      .eq("integration_key", key)
      .maybeSingle();

    if (!existing?.configured_at) {
      return {
        ok: false,
        message: `Add your ${entry.name} settings before turning it on.`,
      };
    }
  }

  const { error } = await supabase.from("clinic_integrations").upsert(
    {
      clinic_id: clinicId,
      integration_key: key,
      status,
      // A deliberate toggle clears a stale error; otherwise a card could stay
      // permanently in the error state after the clinic fixed the cause.
      last_error: null,
    },
    { onConflict: "clinic_id,integration_key" },
  );

  if (error) {
    return { ok: false, message: `Could not update ${entry.name}.` };
  }

  revalidatePath(INTEGRATIONS_PATH);
  return { ok: true, data: { status } };
}

// ---------------------------------------------------------------------------
// 3. saveIntegrationConfigAction — the config modal
// ---------------------------------------------------------------------------

/**
 * Splits the submitted form into the two storage destinations.
 *
 * The split is derived from the catalogue's `secret` flags, not from what the
 * client sent, so a crafted payload cannot route a credential into the
 * member-readable `config` jsonb — which would defeat the whole point of
 * keeping `clinic_integration_secrets` separate.
 */
function splitConfig(
  entry: ReturnType<typeof getIntegrationEntry>,
  config: Record<string, string | undefined>,
  credentials: Record<string, string | undefined>,
) {
  const secretNames = new Set(
    (entry?.fields ?? []).filter((f) => f.secret).map((f) => f.name),
  );

  const safeConfig: Record<string, string> = {};
  const nextSecrets: Record<string, string> = {};

  for (const field of entry?.fields ?? []) {
    const value = secretNames.has(field.name)
      ? credentials[field.name]
      : config[field.name];
    if (value === undefined) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (field.secret) nextSecrets[field.name] = trimmed;
    else safeConfig[field.name] = trimmed;
  }

  return { safeConfig, nextSecrets };
}

export async function saveIntegrationConfigAction(
  input: unknown,
): Promise<ActionResult<{ configured: true }>> {
  const auth = await requireIntegrationWrite();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const parsed = saveIntegrationConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { key, config, credentials } = parsed.data;

  const entry = getIntegrationEntry(key);
  if (!entry) {
    return { ok: false, message: "That integration does not exist." };
  }
  if (entry.backedBy === "clinic_setting") {
    return { ok: false, message: "This integration has no credentials to save." };
  }

  if (entry.featureKey) {
    const planAccess = await getPlanAccess(supabase, clinicId, entry.featureKey);
    if (!isFeatureUnlocked(planAccess, entry.featureKey)) {
      return {
        ok: false,
        message: `${entry.name} is not included in your current plan.`,
      };
    }
  }

  const { safeConfig, nextSecrets } = splitConfig(entry, config, credentials);

  // Required-field check runs against the merged view of what is already saved,
  // so a clinic that saved its API key last week is not told it is missing just
  // because it left the (write-only, therefore blank) field empty today.
  const { data: existing } = await supabase
    .from("clinic_integrations")
    .select("id, config")
    .eq("clinic_id", clinicId)
    .eq("integration_key", key)
    .maybeSingle();

  const existingConfig = (existing?.config as Record<string, unknown>) ?? {};
  const mergedConfig = { ...existingConfig, ...safeConfig };
  const secrets = createSecretsClient();
  const { data: existingSecret } = existing?.id
    ? await secrets
        .from("clinic_integration_secrets")
        .select("id, api_key, api_secret, account_id")
        .eq("integration_id", existing.id)
        .maybeSingle()
    : { data: null };

  const mergedSecrets = {
    api_key: nextSecrets.api_key ?? existingSecret?.api_key ?? null,
    api_secret: nextSecrets.api_secret ?? existingSecret?.api_secret ?? null,
    account_id: nextSecrets.account_id ?? existingSecret?.account_id ?? null,
  };

  const missing = entry.fields
    .filter((f) => f.required)
    .filter((f) =>
      f.secret
        ? !mergedSecrets[f.name as keyof typeof mergedSecrets]
        : !mergedConfig[f.name],
    )
    .map((f) => f.label);
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Add ${missing.join(", ")} before saving.`,
    };
  }

  const { data: saved, error } = await supabase
    .from("clinic_integrations")
    .upsert(
      {
        clinic_id: clinicId,
        integration_key: key,
        // Saving settings does not turn the integration on. The toggle is a
        // separate, explicit act — the mockup conflated the two, which would
        // have shown a green "Active" badge the moment a clinic typed a key.
        status: "disabled",
        config: mergedConfig,
        configured_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "clinic_id,integration_key" },
    )
    .select("id")
    .maybeSingle();

  if (error || !saved) {
    return { ok: false, message: `Could not save ${entry.name} settings.` };
  }

  // Only write the secret row when something actually changed, so re-saving one
  // non-secret setting does not need a service-role write.
  if (Object.keys(nextSecrets).length > 0 || !existingSecret) {
    const { error: secretError } = await secrets
      .from("clinic_integration_secrets")
      .upsert(
        { integration_id: saved.id, ...mergedSecrets },
        { onConflict: "integration_id" },
      );
    if (secretError) {
      return { ok: false, message: `Could not save ${entry.name} credentials.` };
    }
  }

  revalidatePath(INTEGRATIONS_PATH);
  return { ok: true, data: { configured: true } };
}

// ---------------------------------------------------------------------------
// 4. setAppointmentsViewModeAction — Queue Management
// ---------------------------------------------------------------------------

/**
 * Writes `clinics.appointments_view_mode`, the column the appointments page
 * actually reads. This is the one integration in the catalogue whose toggle
 * changes real behaviour today, which is why it is stored where the behaviour
 * lives rather than in a shadow row.
 */
export async function setAppointmentsViewModeAction(
  input: unknown,
): Promise<ActionResult<{ mode: "queue" | "list" }>> {
  const auth = await requireIntegrationWrite();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;

  const parsed = setAppointmentsViewModeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { mode } = parsed.data;

  const { error } = await supabase
    .from("clinics")
    .update({ appointments_view_mode: mode })
    .eq("id", access.clinic.id);

  if (error) {
    return { ok: false, message: "Could not change the appointments view." };
  }

  // Both pages read this preference, so both need to come back fresh.
  revalidatePath(INTEGRATIONS_PATH);
  revalidatePath(APP_ROUTES.app.appointments);
  return { ok: true, data: { mode } };
}

// ---------------------------------------------------------------------------
// 5. disconnectIntegrationAction
// ---------------------------------------------------------------------------

/**
 * Removes the row and cascades the credentials away with it. Used by the
 * config modal's "Disconnect" action so a clinic can revoke a vendor account
 * from inside the product rather than only in the vendor's own console.
 */
export async function disconnectIntegrationAction(
  input: unknown,
): Promise<ActionResult<{ disconnected: true }>> {
  const auth = await requireIntegrationWrite();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const parsed = setIntegrationStatusSchema
    .pick({ key: true })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid request." };
  }

  const entry = getIntegrationEntry(parsed.data.key);
  if (!entry) {
    return { ok: false, message: "That integration does not exist." };
  }
  if (entry.backedBy === "clinic_setting") {
    return { ok: false, message: "This integration cannot be disconnected." };
  }

  // ON DELETE CASCADE on clinic_integration_secrets.integration_id takes the
  // credentials with the row, so one delete is the whole revocation.
  const { error } = await supabase
    .from("clinic_integrations")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("integration_key", parsed.data.key);

  if (error) {
    return { ok: false, message: `Could not disconnect ${entry.name}.` };
  }

  revalidatePath(INTEGRATIONS_PATH);
  return { ok: true, data: { disconnected: true } };
}
