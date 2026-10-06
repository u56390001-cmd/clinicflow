"use client";

import type * as React from "react";

import { buttonClass } from "@/types/website";
import type { WebsiteTheme } from "@/types/website";

/**
 * The site's interactive primitives - and the reason they have their own file.
 *
 * `SiteCta` renders an anchor with an `onClick`, so it can only exist in a
 * component module. It used to live in `site-ui.tsx`, which has no `"use client"`
 * boundary, and the moment a *server* component rendered it (the doctor bio page
 * does) React tried to serialise the handler into the RSC payload and threw
 * "Event handlers cannot be passed to Client Component props".
 *
 * Keeping the handler in a client module makes the boundary explicit: a server
 * page now renders a client component and passes it nothing but serialisable
 * props. `site-ui.tsx` re-exports both names so every existing import path keeps
 * working.
 */

/**
 * Open the floating assistant in place, on this page.
 *
 * `href="/widget/<slug>"` stays on the anchor deliberately: it is the no-JS
 * fallback, and the honest link for anything that crawls or middle-clicks. But
 * the widget script is deferred, so a visitor can click a booking CTA before it
 * has run - and this handler used to return silently in that window, which let
 * the browser follow the href and dump them on a separate near-empty page in the
 * middle of the booking funnel. The floating panel exists precisely to avoid
 * that, so the default navigation is now always suppressed and the widget is
 * given a short window to turn up. Only if it genuinely never loads do we send
 * them to the standalone page, which at least shows the same chat.
 */
export function openWidgetFallback(event: React.MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();

  const href = event.currentTarget.getAttribute("href") ?? "";
  const openWidget = () =>
    (window as { MedBookWidget?: { open?: () => void } }).MedBookWidget?.open;

  // The site states up front, in an inline script, whether the assistant is
  // switched on for this page. Without that signal there is no way to tell
  // "switched off" apart from "still downloading", and every booking click would
  // sit through the full retry window below before anything happened - which
  // reads to a patient as a dead button.
  if ((window as { __medbookAssistantOn?: boolean }).__medbookAssistantOn === false) {
    window.location.href = href;
    return;
  }

  const open = openWidget();
  if (open) {
    open();
    return;
  }

  // Not loaded yet. Poll briefly rather than navigating; a few hundred
  // milliseconds of patience is invisible to the visitor and saves the page.
  const deadline = Date.now() + 4000;
  const poll = () => {
    const ready = openWidget();
    if (ready) {
      ready();
      return;
    }
    if (Date.now() < deadline) {
      window.setTimeout(poll, 100);
      return;
    }
    window.location.href = href;
  };
  window.setTimeout(poll, 100);
}

/**
 * A booking call to action.
 *
 * Every CTA on the site used to repeat the same three lines - the widget href,
 * the fallback handler and `buttonClass(theme)` - which is how the hero, the
 * header and the contact block drifted apart in size and padding. One component
 * means they cannot.
 */
export function SiteCta({
  widgetSlug,
  theme,
  children,
  className = "",
  ...rest
}: {
  widgetSlug: string;
  theme: WebsiteTheme;
  children: React.ReactNode;
  className?: string;
} & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "onClick" | "className" | "children"
>) {
  return (
    <a
      href={`/widget/${widgetSlug}`}
      onClick={openWidgetFallback}
      className={`${buttonClass(theme)} ${className}`.trim()}
      {...rest}
    >
      {children}
    </a>
  );
}
