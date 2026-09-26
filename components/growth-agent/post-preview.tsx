"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Info, MapPin, Phone } from "lucide-react";

import { MAX_POST_CHARS } from "@/lib/ai/growth-post";
import { cn } from "@/lib/utils";

/**
 * Live post preview — the one piece of this page that shows the clinic's copy
 * as a patient will meet it.
 *
 * Two deliberate choices:
 *
 * 1. It is the only dark surface in the app (`bg-secondary`). The generator
 *    beside it is the instrument; this is the output. Making the output the
 *    darkest object on the page is what stops this reading as another settings
 *    form.
 *
 * 2. It is an *approximation*, and it says so. The reference prototype claimed
 *    "exact layout as shown on Google Search & Maps" over a hand-drawn mock —
 *    which is both false and a trademark problem. This renders a plain business
 *    card in our own type, and labels it as a preview. Nothing here imitates
 *    Google's own visual identity.
 *
 * There is no star rating in this mock. The prototype showed a confident
 * "4.9 (128 reviews)" for a clinic with no review data anywhere in the
 * database; a fabricated rating on a real clinic's dashboard is exactly the
 * kind of invented number this page refuses to show anywhere else.
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
      className="overflow-hidden rounded-card border border-text-muted/30 shadow-card"
    >
      <div className="flex items-center justify-between gap-3 bg-secondary px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Building2 className="size-4 shrink-0 text-primary-light" aria-hidden="true" />
          <h2 className="truncate text-sm font-semibold text-white">
            What your patients will see
          </h2>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-pill px-2.5 py-0.5 text-xs font-medium",
            isDraft
              ? "bg-white/10 text-white/70"
              : "bg-primary/25 text-primary-light",
          )}
        >
          {isDraft ? "Sketch" : "Draft"}
        </span>
      </div>

      <div className="bg-app p-5">
        <div className="overflow-hidden rounded-card border border-text-muted/20 bg-surface">
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
                  <MapPin className="mt-px size-3 shrink-0 text-text-muted" aria-hidden="true" />
                  <span className="min-w-0">{clinicAddress}</span>
                </p>
              ) : null}
              {clinicPhone ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-secondary">
                  <Phone className="size-3 shrink-0 text-text-muted" aria-hidden="true" />
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
          <div className="p-4">
            <p className="mb-2 text-xs font-medium text-text-muted">New post</p>
            <p
              className={cn(
                "text-sm leading-relaxed text-text-primary transition-opacity duration-200",
                fading ? "opacity-0" : "opacity-100",
              )}
            >
              {postText}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-white">
                {cta}
              </span>
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
          </div>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs text-text-secondary">
          <Info className="mt-px size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
          <span>
            An approximation of how a Google Business post reads. Google lays
            these out differently across Search, Maps and the knowledge panel.
          </span>
        </p>
      </div>
    </section>
  );
}
