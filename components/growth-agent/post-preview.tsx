"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Info, MapPin, Phone } from "lucide-react";

import { MAX_POST_CHARS } from "@/lib/ai/growth-post";
import { cn } from "@/lib/utils";

/**
 * Live post preview — the one piece of this page that shows the clinic's copy
 * as a patient will meet it.
 *
 * Three deliberate choices, all of which diverge from the reference prototype:
 *
 * 1. The header is solid primary, matching the prototype. It is the only
 *    saturated surface on the page, which is what makes the output read as
 *    output rather than as another settings card.
 *
 * 2. There is no photo banner. The prototype opened with a stock Unsplash
 *    interior labelled "Clinic Photo". No clinic image exists anywhere in the
 *    schema — `GrowthAgentSnapshot.clinic` carries only name, address and
 *    phone — so a banner here would be a stock photo standing in for a real
 *    clinic's premises. The monogram is the honest version of the same slot.
 *
 * 3. There is no star rating. The prototype showed a confident "4.9 (128
 *    reviews)" for a clinic with no review data in the database. A fabricated
 *    rating on a real clinic's dashboard is exactly the kind of invented number
 *    this page refuses to show anywhere else.
 *
 * It is also an *approximation*, and it says so. The prototype claimed "exact
 * layout as shown on Google Search & Maps" — which is both false and a
 * trademark problem. This renders a plain business card in our own type.
 */
export function PostPreview({
  clinicName,
  clinicAddress,
  clinicPhone,
  postText,
  cta,
  isDraft,
}: {
  clinicName: string;
  clinicAddress: string | null;
  clinicPhone: string | null;
  postText: string;
  cta: string;
  /** True while the text is a pre-generation sketch rather than a real draft. */
  isDraft: boolean;
}) {
  // Re-fade the body when the text changes, so the panel visibly answers the
  // keystroke that caused it. Motion tied to a user action, not decoration.
  const [fading, setFading] = useState(false);
  const previousText = useRef(postText);

  useEffect(() => {
    if (previousText.current === postText) return;
    previousText.current = postText;
    setFading(true);
    const timer = window.setTimeout(() => setFading(false), 220);
    return () => window.clearTimeout(timer);
  }, [postText]);

  const monogram = clinicName.trim().charAt(0).toUpperCase() || "C";
  const overLimit = postText.length > MAX_POST_CHARS;
  const nearLimit = postText.length > MAX_POST_CHARS * 0.9;

  return (
    <section
      aria-label="Post preview"
      className="overflow-hidden rounded-card border border-text-muted/30 bg-surface"
    >
      <div className="flex items-center justify-between gap-3 bg-primary px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Building2 className="size-4 shrink-0 text-white/80" aria-hidden="true" />
          <h2 className="truncate text-sm font-semibold text-white">
            Live profile preview
          </h2>
        </div>
        <span className="shrink-0 rounded-pill bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white">
          {isDraft ? "Live as you type" : "Generated draft"}
        </span>
      </div>

      <div className="bg-app p-4">
        <div className="overflow-hidden rounded-card border border-text-muted/25 bg-surface">
          {/* Business identity — the real clinic row, not a stock photo. */}
          <div className="flex items-start gap-3 border-b border-text-muted/15 p-4">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-control bg-primary text-lg font-semibold text-white"
              aria-hidden="true"
            >
              {monogram}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">
                {clinicName}
              </p>
              {clinicAddress ? (
                <p className="mt-0.5 flex items-start gap-1.5 text-xs text-text-secondary">
                  <MapPin
                    className="mt-px size-3 shrink-0 text-text-muted"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">{clinicAddress}</span>
                </p>
              ) : null}
              {clinicPhone ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-secondary">
                  <Phone
                    className="size-3 shrink-0 text-text-muted"
                    aria-hidden="true"
                  />
                  {clinicPhone}
                </p>
              ) : null}
            </div>
          </div>

          {/* The post itself. Opacity is driven by a state change in an effect
              rather than a `key` remount, so the text cross-fades instead of
              being torn out and re-inserted — a keyed remount paints the new
              string at full opacity for one frame before the fade starts, which
              reads as a flicker. */}
          <div className="bg-app/60 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-text-muted">New post</span>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  overLimit
                    ? "font-medium text-status-destructive"
                    : nearLimit
                      ? "text-status-warning"
                      : "text-text-muted",
                )}
              >
                {postText.length} / {MAX_POST_CHARS}
              </span>
            </div>

            <div className="rounded-control border border-text-muted/20 bg-surface p-3">
              <p
                className={cn(
                  "text-sm leading-relaxed text-text-primary transition-opacity duration-200",
                  fading ? "opacity-0" : "opacity-100",
                )}
              >
                {postText}
              </p>
              <div className="mt-3">
                <span className="block w-full rounded-control bg-primary px-4 py-2 text-center text-sm font-medium text-white">
                  {cta}
                </span>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs text-text-secondary">
          <Info
            className="mt-px size-3.5 shrink-0 text-text-muted"
            aria-hidden="true"
          />
          <span>
            An approximation of how a Google Business post reads. Google lays
            these out differently across Search, Maps and the knowledge panel.
          </span>
        </p>
      </div>
    </section>
  );
}