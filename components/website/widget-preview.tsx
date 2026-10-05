"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";

import { WidgetChat } from "@/components/widget/widget-chat";
import { resolveWidgetColor } from "@/types/website";
import type { WebsiteConfig } from "@/types/website";

/** The clinic-wide settings the widget reads, as the builder sees them. */
export type WidgetAiSettings = {
  isActivated: boolean;
  enabled: boolean;
  agentName: string | null;
  welcomeMessage: string | null;
  avatarUrl: string | null;
  headerSubtitle: string | null;
};

const AGENT_FALLBACK = "AI Assistant";

/**
 * The live booking assistant, mounted inside the builder's preview.
 *
 * This is the real `WidgetChat` — the same component `/widget/<slug>` renders —
 * not a mock of it. That matters: a doctor checking a booking flow in the
 * builder is exercising the actual conversation, and a preview that only looks
 * like the widget will happily hide a broken one.
 *
 * It sits in a zero-height `sticky` wrapper so the launcher stays pinned to the
 * corner of the preview pane at every scroll position, exactly as
 * `position: fixed` does on the published site. `public/widget.js` cannot be used
 * here because it appends itself to `document.body` and pins to the viewport,
 * which would float the bubble over the inspector rather than over the page.
 */
export function WidgetPreview({
  config,
  ai,
  clinicSlug,
  clinicName,
  frameRef,
}: {
  config: WebsiteConfig;
  ai: WidgetAiSettings;
  clinicSlug: string;
  clinicName: string;
  /** The preview frame, measured so the chat panel matches the page it sits on. */
  frameRef: React.RefObject<HTMLElement | null>;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  // The frame bounds the panel, so its own box is what the panel has to fit
  // inside. Re-measuring on resize keeps a desktop-to-mobile switch honest.
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [frameRef]);

  if (!config.widget.enabled) return null;

  // The clinic-wide master switch wins, exactly as it does on the live site.
  // Saying so beats opening a chat that answers every message with "not
  // available right now".
  if (!ai.isActivated || !ai.enabled) {
    return (
      <div className="pointer-events-none sticky bottom-0 z-30 mx-4 h-0">
        <div className="pointer-events-auto absolute bottom-4 right-4 flex max-w-[280px] items-start gap-2 rounded-control border border-status-warning/30 bg-white p-3 text-[11px] leading-snug text-text-secondary shadow-card">
          <AlertCircle
            className="mt-0.5 size-3.5 shrink-0 text-status-warning"
            aria-hidden="true"
          />
          <span>
            The assistant is switched off clinic-wide, so it will not answer on
            this website yet. Turn it on under{" "}
            <span className="font-medium text-text-primary">AI Agent</span>.
          </span>
        </div>
      </div>
    );
  }

  if (!size) return null;

  return (
    <div className="pointer-events-none sticky bottom-0 z-30 mx-4 h-0">
      <WidgetChat
        contained={{ maxWidth: size.width, maxHeight: size.height }}
        slug={clinicSlug}
        clinicName={clinicName}
        widgetColor={resolveWidgetColor(config.theme, config.widget)}
        widgetPosition={config.widget.position}
        avatarUrl={ai.avatarUrl}
        headerSubtitle={ai.headerSubtitle}
        agentName={ai.agentName || AGENT_FALLBACK}
        welcomeMessage={ai.welcomeMessage}
      />
    </div>
  );
}