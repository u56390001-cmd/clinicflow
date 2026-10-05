/**
 * Where a clinic's public booking page lives.
 *
 * Every place that shows, copies, encodes or embeds the link goes through
 * `buildBookingUrl` so the slug can never drift between the sidebar and the
 * QR code.
 *
 * Two bugs this exists to prevent:
 *
 * 1. Prefixing a protocol onto a value that already had one, which produced
 *    `https://http://localhost:3000/book/x`. `toBaseUrl` strips any existing
 *    scheme before one is added.
 * 2. Hardcoding a domain. The link is resolved against the origin the user is
 *    actually on, so local dev (`https://localhost:3000` under the
 *    experimental-HTTPS dev server) produces a link that genuinely opens.
 */

/** Path of the public booking page. Must match `app/book/[slug]/page.tsx`. */
export const BOOKING_PATH = "/book";

/**
 * The slug patients see: the clinic's custom one if set, otherwise the
 * clinic's own slug.
 *
 * The fallback is why `booking_slug` is nullable — a clinic that never sets a
 * custom slug still gets a working link.
 */
export function resolveBookingSlug(
  bookingSlug: string | null | undefined,
  clinicSlug: string,
): string {
  const custom = bookingSlug?.trim();
  return custom && custom.length > 0 ? custom : clinicSlug;
}

/**
 * Strip a trailing slash and any scheme/host prefix from a configured base URL.
 *
 * `NEXT_PUBLIC_SITE_URL` is often written with the scheme included, and
 * sometimes pasted from the address bar with a path trailing it. Normalising
 * here means callers can pass either form.
 */
function toBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/^https?:\/\//i, "");
}

/**
 * The origin to build links from.
 *
 * Prefers `NEXT_PUBLIC_SITE_URL` and falls back to localhost. Scheme handling
 * matters: if the configured value carries `http://` but the dev server serves
 * HTTPS, links copied over HTTP will not open for the patient.
 */
export function getBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "http://localhost:3000";

  const bare = toBaseUrl(configured);

  // Preserve the configured scheme when there is one.
  const schemeMatch = configured.trim().match(/^(https?):\/\//i);
  if (schemeMatch) {
    return `${schemeMatch[1].toLowerCase()}://${bare}`;
  }

  // No scheme configured. The `dev` script passes `--experimental-https`, so a
  // bare localhost is meant to be HTTPS; anything else is assumed to be too,
  // since a mixed-content bookmarklet served over HTTP will not load in an
  // https page anyway.
  return `https://${bare}`;
}

/**
 * Normalise a base URL supplied by a caller, so both `"example.com"` and
 * `"https://example.com/"` produce the same result.
 */
function normalizeBase(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const bare = toBaseUrl(trimmed);
  const scheme = trimmed.match(/^(https?):\/\//i);
  return `${scheme ? `${scheme[1].toLowerCase()}://` : "https://"}${bare}`;
}

/**
 * Full patient-facing booking URL, e.g. `https://clinic.example/book/abc`.
 *
 * `baseUrl` is passed in rather than read from the environment so the client
 * card and the server page cannot disagree. `NEXT_PUBLIC_*` values are
 * inlined at build time, so on the client they reflect the build, not the
 * origin currently being browsed.
 */
export function buildBookingUrl(slug: string, baseUrl?: string): string {
  const base = normalizeBase(baseUrl ?? getBaseUrl());
  return `${base}${BOOKING_PATH}/${slug}`;
}

/**
 * The `<iframe>` snippet handed to clinics for their own website.
 *
 * The URL is XML-escaped because it is copied into HTML: a bare `&` in a
 * query string would otherwise produce markup that fails to parse.
 */
export function buildEmbedSnippet(
  slug: string,
  baseUrl?: string,
  title?: string,
): string {
  const url = buildBookingUrl(slug, baseUrl);
  const safeTitle = (title ?? "Book an appointment").replace(
    /[<>&"']/g,
    (char) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[
        char
      ] ?? char,
  );

  return [
    `<iframe`,
    `  src="${url}"`,
    `  title="${safeTitle}"`,
    `  width="100%"`,
    `  height="720"`,
    `  style="border:0;max-width:640px"`,
    `  loading="lazy"`,
    `  referrerpolicy="no-referrer"`,
    `></iframe>`,
  ].join("\n");
}

/**
 * Copy `text` to the clipboard.
 *
 * `navigator.clipboard` is unavailable outside a secure context, and this app
 * is frequently opened over plain HTTP on a LAN address during development —
 * which is exactly when the copy button silently did nothing. The textarea
 * fallback uses `execCommand`, which still works in those contexts.
 *
 * Returns whether the copy actually happened so the caller can show a failure
 * instead of a success message that did not copy anything.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or a lost user gesture: fall through.
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Off-screen rather than `display: none`, which would make the copy a
    // no-op in some browsers.
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
