"use server";

/**
 * Add-ons marketplace server actions (migration 0060).
 *
 * Follows the same order integrations.ts does, and the same security model:
 *
 *   1. Resolve the clinic from the signed-in user's own membership.
 *   2. Check the role — `canWriteClinic` for anything that changes state.
 *   3. Validate the input with Zod.
 *
 * Only then does anything touch the database. No action accepts a `clinicId`
 * from the client, so a crafted request cannot name a clinic the caller does
 * not belong to. RLS is the backstop, not the primary control.
 *
 * ## Subscriptions are one row per add-on, not per buy
 *
 * `clinic_addons` is UNIQUE on (clinic_id, addon_id). Subscribing upserts the
 * row to `active`; cancelling flips that same row to `cancelled` — the row is
 * kept for history, and re-enabling after a cancellation is an update, not a
 * second subscription.
 *
 * ## Feature gating
 *
 * `checkAddonStatus` resolves the clinic from the caller's membership, then
 * asks `public.is_addon_active`. It deliberately ignores any clinic id a
 * caller might pass: the RPC is SECURITY DEFINER, so taking an arbitrary
 * clinic id from the client would let any signed-in user probe whether a
 * clinic runs an add-on.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canWriteClinic,
  getCurrentClinic,
  type CurrentClinicAccess,
} from "@/lib/clinic-access";
import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";
import type {
  Addon,
  AddonSubscriptionStatus,
  Database,
} from "@/types/database";
import {
  cancelAddonSchema,
  subscribeAddonSchema,
  updateAddonQuantitySchema,
} from "@/lib/validation/schemas";

const ADDONS_PATH = APP_ROUTES.app.addons;

type AddonsAuth =
  | {
      ok: true;
      supabase: SupabaseClient<Database>;
      access: CurrentClinicAccess;
    }
  | { ok: false; message: string };

/** Resolve clinic + assert read access. Staff may browse the storefront. */
async function requireAddonsRead(): Promise<AddonsAuth> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You need a clinic before you can browse the add-ons store.",
    };
  }
  return { ok: true, supabase, access };
}

/** Resolve clinic + assert write access. Only owners/admins subscribe. */
async function requireAddonsWrite(): Promise<AddonsAuth> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You need a clinic before you can manage add-ons.",
    };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can subscribe to or change add-ons.",
    };
  }
  return { ok: true, supabase, access };
}

// ---------------------------------------------------------------------------
// 1. getAddonsSnapshotAction — the storefront read model
// ---------------------------------------------------------------------------

/** One storefront card: the catalog row plus the clinic's subscription. */
export type AddonView = Addon & {
  subscription: {
    id: string | null;
    status: AddonSubscriptionStatus | null;
    quantity: number;
  } | null;
};

export type AddonsSnapshot = {
  catalog: AddonView[];
  canManage: boolean;
  activeCount: number;
  /** Sum of price × units for every active subscription. */
  monthlySpendPkr: number;
};

export async function getAddonsSnapshotAction(): Promise<
  ActionResult<AddonsSnapshot>
> {
  const auth = await requireAddonsRead();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const [catalogResult, subsResult] = await Promise.all([
    supabase
      .from("addons")
      .select(
        "id, slug, name, category, description, price_pkr, billing_period, is_quantity_based, badge_text, sort_order, created_at",
      )
      .order("sort_order", { ascending: true }),
    supabase
      .from("clinic_addons")
      .select("id, addon_id, status, quantity")
      .eq("clinic_id", clinicId),
  ]);

  if (catalogResult.error || subsResult.error) {
    return { ok: false, message: "Could not load the add-ons store." };
  }

  const subsByAddon = new Map(
    (subsResult.data ?? []).map((sub) => [
      sub.addon_id,
      { id: sub.id, status: sub.status, quantity: sub.quantity },
    ]),
  );

  let activeCount = 0;
  let monthlySpendPkr = 0;
  const catalog: AddonView[] = (catalogResult.data ?? []).map((addon) => {
    const sub = subsByAddon.get(addon.id);
    if (sub && sub.status === "active") {
      activeCount += 1;
      monthlySpendPkr += addon.price_pkr * sub.quantity;
    }
    return { ...addon, subscription: sub ?? null };
  });

  return {
    ok: true,
    data: {
      catalog,
      canManage: canWriteClinic(access.role),
      activeCount,
      monthlySpendPkr,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. subscribeAddonAction — activate (or re-activate)
// ---------------------------------------------------------------------------

export async function subscribeAddonAction(
  input: unknown,
): Promise<ActionResult<{ addonId: string; slug: string }>> {
  const auth = await requireAddonsWrite();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const parsed = subscribeAddonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const { data: addon } = await supabase
    .from("addons")
    .select("id, is_quantity_based")
    .eq("slug", parsed.data.slug)
    .maybeSingle();
  if (!addon) {
    return { ok: false, message: "That add-on does not exist." };
  }

  const { error } = await supabase.from("clinic_addons").upsert(
    {
      clinic_id: clinicId,
      addon_id: addon.id,
      // Re-enabling after a cancellation is an update to the same row.
      status: "active",
      quantity: addon.is_quantity_based ? parsed.data.quantity : 1,
      activated_at: new Date().toISOString(),
      metadata: {},
    },
    { onConflict: "clinic_id,addon_id" },
  );

  if (error) {
    return { ok: false, message: "Could not activate the add-on." };
  }

  revalidatePath(ADDONS_PATH);
  return { ok: true, data: { addonId: addon.id, slug: parsed.data.slug } };
}

// ---------------------------------------------------------------------------
// 3. updateAddonQuantityAction — seat/display units
// ---------------------------------------------------------------------------

export async function updateAddonQuantityAction(
  input: unknown,
): Promise<ActionResult<{ quantity: number }>> {
  const auth = await requireAddonsWrite();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const parsed = updateAddonQuantitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { addonId, quantity } = parsed.data;

  // Only quantity-based add-ons accept a unit count. Feature add-ons are a
  // flat subscription; accepting a quantity for one would be meaningless.
  const { data: addon } = await supabase
    .from("addons")
    .select("is_quantity_based")
    .eq("id", addonId)
    .maybeSingle();
  if (!addon) {
    return { ok: false, message: "That add-on does not exist." };
  }
  if (!addon.is_quantity_based) {
    return { ok: false, message: "That add-on is not bought per unit." };
  }

  const { error } = await supabase
    .from("clinic_addons")
    .update({ quantity })
    .eq("clinic_id", clinicId)
    .eq("addon_id", addonId);

  if (error) {
    return { ok: false, message: "Could not change the quantity." };
  }

  revalidatePath(ADDONS_PATH);
  return { ok: true, data: { quantity } };
}

// ---------------------------------------------------------------------------
// 4. cancelAddonAction — request cancellation
// ---------------------------------------------------------------------------

/**
 * Flips the row to `cancelled` rather than deleting it: the UNIQUE constraint
 * means a re-enable is an update to the same row, so the row is the add-on's
 * history. The marketplace treats anything that is not `active` as not running.
 */
export async function cancelAddonAction(
  input: unknown,
): Promise<ActionResult<{ cancelled: true }>> {
  const auth = await requireAddonsWrite();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { supabase, access } = auth;
  const clinicId = access.clinic.id;

  const parsed = cancelAddonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const { error } = await supabase
    .from("clinic_addons")
    .update({ status: "cancelled" })
    .eq("clinic_id", clinicId)
    .eq("addon_id", parsed.data.addonId)
    .eq("status", "active");

  if (error) {
    return { ok: false, message: "Could not cancel the add-on." };
  }

  revalidatePath(ADDONS_PATH);
  return { ok: true, data: { cancelled: true } };
}

// ---------------------------------------------------------------------------
// 5. checkAddonStatus — feature gate for other modules
// ---------------------------------------------------------------------------

/**
 * True when the signed-in user's own clinic holds an active subscription for
 * the add-on. Resolves the clinic from the membership rather than accepting
 * a caller-supplied clinic id — `public.is_addon_active` is SECURITY DEFINER,
 * so trusting the caller here would let anyone probe another clinic's add-ons.
 */
export async function checkAddonStatus(slug: string): Promise<boolean> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) return false;

  const { data, error } = await supabase.rpc("is_addon_active", {
    p_clinic_id: access.clinic.id,
    p_addon_slug: slug,
  });
  return !error && Boolean(data);
}