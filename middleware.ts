import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  entitlementForPath,
  isRouteAllowed,
  SETUP_ALLOWLIST_PREFIXES,
  type Entitlements,
} from "@/lib/entitlements";
import { APP_ROUTES, CLINIC_SLUG_REGEX } from "@/lib/constants";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Route protection and entitlement gating.
 *
 * - `/app/*` requires a session -> unauthenticated visitors are sent to
 *   `/login` (preserving the intended destination in `?next=`).
 * - Auth pages bounce already-authenticated users back into the app.
 *   `/reset-password` is deliberately excluded: password recovery relies on a
 *   session that only exists after the recovery link is exchanged.
 * - A clinic that has just been approved (and therefore has not been set up
 *   yet) is sent to the setup wizard instead of the dashboard.
 * - A module the clinic's plan does not include is sent to the upgrade
 *   screen, so a locked module is never a blank page and a direct URL is
 *   never a way around the gate.
 * - Subdomain-based public website routing: in production, requests to
 *   `clinic-slug.app.example.com` are rewritten to `/site/[slug]`. This
 *   requires DNS setup pointing `*.app.example.com` to the app. In local
 *   dev (localhost), subdomains are not available so `/site/[slug]` is used
 *   directly.
 */

/** Paths that stay reachable while a clinic is still setting itself up. */
function isSetupAllowlisted(pathname: string): boolean {
  return SETUP_ALLOWLIST_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Read the caller's clinic and whether it has finished its first-run setup.
 *
 * One query: the caller's latest membership with the clinic's setup marker
 * folded in. Returns null when the caller has no clinic yet.
 */
async function readClinicSetupState(
  supabase: Awaited<ReturnType<typeof updateSession>>["supabase"],
  userId: string,
): Promise<{ clinicId: string; onboardingCompleted: boolean } | null> {
  const { data } = await supabase
    .from("clinic_members")
    .select("clinic_id, clinics(onboarding_completed_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as
    | { clinic_id: string; clinics?: { onboarding_completed_at: string | null } | null }
    | null;

  if (!row?.clinic_id) return null;
  return {
    clinicId: row.clinic_id,
    onboardingCompleted: !!row.clinics?.onboarding_completed_at,
  };
}

/**
 * The entitlements of a clinic, computed by the shared resolver.
 *
 * The middleware cannot use the React-cached resolver (there is no React
 * render here), so it reads the same three tables directly and reuses the
 * same rules. Only the modules of the plan and the active add-ons matter for
 * a route decision.
 */
async function readEntitlements(
  supabase: Awaited<ReturnType<typeof updateSession>>["supabase"],
  clinicId: string,
): Promise<Entitlements> {
  const [{ data: subscription }, { data: addonRows }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status, current_period_end, plan:subscription_plans(features)")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("clinic_addons")
      .select("status, quantity, addon:addons(slug)")
      .eq("clinic_id", clinicId)
      .eq("status", "active"),
  ]);

  const sub = subscription as
    | { status: string; current_period_end: string | null; plan?: { features?: { key: string; included: boolean }[] } | null }
    | null;

  const granting =
    !!sub &&
    sub.status === "active" &&
    (!sub.current_period_end ||
      new Date(sub.current_period_end).getTime() > Date.now());

  const features = granting
    ? (sub?.plan?.features ?? [])
        .filter((feature) => feature?.included === true)
        .map((feature) => feature.key)
    : [];

  const addons: string[] = [];
  const addonQuantity: Record<string, number> = {};
  for (const row of addonRows ?? []) {
    const slug = (row as { addon?: { slug?: string } | null }).addon?.slug;
    if (!slug) continue;
    addons.push(slug);
    addonQuantity[slug] = (addonQuantity[slug] ?? 0) + (row.quantity ?? 1);
  }

  return {
    plan: null,
    subscription: null,
    hasActiveSubscription: granting,
    features,
    addons,
    addonQuantity,
    limits: { doctorSeats: 0, teamSeats: 0 },
  };
}

export async function middleware(request: NextRequest) {
  const { supabase, user, response } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  // ------------------------------------------------------------------
  // Subdomain-based public website routing (production only)
  // ------------------------------------------------------------------
  // In production, the app is served from a base domain (e.g. app.example.com).
  // Clinic websites are accessed via `clinic-slug.app.example.com`.
  // We detect this pattern and rewrite to `/site/[slug]`.
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN; // e.g. "app.example.com"
  if (baseDomain && host !== baseDomain) {
    // Extract the subdomain: strip the base domain from the host
    const subdomain = host.replace(`.${baseDomain}`, "").replace(baseDomain, "");
    if (subdomain && CLINIC_SLUG_REGEX.test(subdomain) && subdomain !== "www") {
      // Rewrite to /site/[slug] — the user sees the subdomain URL but Next.js
      // serves the /site/[slug] page
      const url = request.nextUrl.clone();
      url.pathname = `/site/${subdomain}`;
      return NextResponse.rewrite(url);
    }
  }

  // ------------------------------------------------------------------
  // Standard route protection
  // ------------------------------------------------------------------
  const isProtectedRoute = pathname.startsWith("/app/");
  const isAuthRoute =
    pathname === APP_ROUTES.auth.login ||
    pathname === APP_ROUTES.auth.signup ||
    pathname === APP_ROUTES.auth.verify ||
    pathname === APP_ROUTES.auth.forgotPassword;

  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = APP_ROUTES.auth.login;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = APP_ROUTES.app.dashboard;
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  // ------------------------------------------------------------------
  // Entitlement gating
  // ------------------------------------------------------------------
  if (isProtectedRoute && user) {
    const setupState = await readClinicSetupState(supabase, user.id);

    // A clinic that was just provisioned still has to be set up. Everything
    // else would be a dead end, so the wizard is the only way through.
    if (setupState && !setupState.onboardingCompleted && !isSetupAllowlisted(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = APP_ROUTES.app.clinicSetup;
      url.search = "";
      return NextResponse.redirect(url);
    }

    // A module the plan does not include opens the upgrade screen instead of
    // the module. The query only runs for routes that actually need one, so
    // the common case (dashboard, patients, appointments) pays nothing.
    const requirement = entitlementForPath(pathname);
    if (requirement && setupState) {
      const entitlements = await readEntitlements(supabase, setupState.clinicId);
      if (!isRouteAllowed(entitlements, pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = APP_ROUTES.app.billing;
        url.search = "";
        url.searchParams.set(
          "upgrade",
          requirement.feature ?? requirement.addon ?? requirement.label,
        );
        url.searchParams.set("from", pathname);
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and image optimization routes; run everywhere else.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
