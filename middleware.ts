import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { APP_ROUTES, CLINIC_SLUG_REGEX } from "@/lib/constants";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Route protection.
 *
 * - `/app/*` requires a session -> unauthenticated visitors are sent to
 *   `/login` (preserving the intended destination in `?next=`).
 * - Auth pages bounce already-authenticated users back into the app.
 *   `/reset-password` is deliberately excluded: password recovery relies on a
 *   session that only exists after the recovery link is exchanged.
 * - Subdomain-based public website routing: in production, requests to
 *   `clinic-slug.app.example.com` are rewritten to `/site/[slug]`. This
 *   requires DNS setup pointing `*.app.example.com` to the app. In local
 *   dev (localhost), subdomains are not available so `/site/[slug]` is used
 *   directly.
 */
export async function middleware(request: NextRequest) {
  const { user, response } = await updateSession(request);

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

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and image optimization routes; run everywhere else.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
