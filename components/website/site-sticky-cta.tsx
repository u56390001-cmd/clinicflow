"use client";

import type * as React from "react";

import { PhoneCall, CalendarClock, Clock, Users, MapPin, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WebsiteConfig, WebsiteTheme } from "@/types/website";

/**
 * Sticky CTA / Floating Widget Section
 *
 * A floating call-to-action button that sticks to the bottom or side of the screen.
 * Configurable position, shape, size, color, text, and icon.
 */

export function StickyCtaBody({
  config,
  widgetSlug,
  className,
}: {
  config: WebsiteConfig;
  theme: WebsiteTheme;
  /** Public booking slug, used when the button has no explicit URL. */
  widgetSlug?: string;
  className?: string;
}) {
  const { stickyCta } = config.content;

  if (!stickyCta.visible) return null;

  const {
    text = "Book Now",
    url = "",
    position = "bottom-right",
    size = "medium",
    shape = "pill",
    backgroundColor,
    icon = "PhoneCall",
  } = stickyCta;

  // Position variants
  const positionClasses = {
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "top-right": "top-4 right-4",
    "top-left": "top-4 left-4",
  };

  const sizeClasses = {
    small: "h-10 px-4 text-sm",
    medium: "h-12 px-5 text-base",
    large: "h-14 px-6 text-lg",
  };

  const shapeClasses = {
    pill: "rounded-full",
    rounded: "rounded-lg",
    square: "rounded-md",
  };

  const backgroundColorClass = backgroundColor
    ? `bg-[${backgroundColor}]`
    : `bg-[var(--site-primary)]`;

  // Icon selection
  const getIcon = () => {
    switch (icon) {
      case "PhoneCall":
        return <PhoneCall className="size-4" aria-hidden="true" />;
      case "MessageSquare":
        return <MessageSquare className="size-4" aria-hidden="true" />;
      case "CalendarClock":
        return <CalendarClock className="size-4" aria-hidden="true" />;
      case "Clock":
        return <Clock className="size-4" aria-hidden="true" />;
      case "Users":
        return <Users className="size-4" aria-hidden="true" />;
      case "MapPin":
        return <MapPin className="size-4" aria-hidden="true" />;
      default:
        return <PhoneCall className="size-4" aria-hidden="true" />;
    }
  };

  return (
    <div
      className={cn(
        "fixed z-50 flex items-center gap-3 shadow-lg transition-all hover:scale-105",
        positionClasses[position],
        className
      )}
      role="button"
      aria-label={`Book ${text}`}
    >
      <a
        href={url || (widgetSlug ? `/widget/${widgetSlug}` : "#booking")}
        className={cn(
          "flex items-center gap-2 text-white hover:text-white/90 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--site-primary)]",
          sizeClasses[size],
          shapeClasses[shape],
          backgroundColorClass,
          "no-underline"
        )}
        onClick={(e) => {
          e.preventDefault();
          const href = e.currentTarget.getAttribute("href") ?? "";
          const openWidget = () =>
            (window as { MedBookWidget?: { open?: () => void } }).MedBookWidget?.open;

          if ((window as { __medbookAssistantOn?: boolean }).__medbookAssistantOn === false) {
            window.location.href = href;
            return;
          }

          const open = openWidget();
          if (open) {
            open();
            return;
          }

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
        }}
      >
        {getIcon()}
        <span>{text}</span>
      </a>
    </div>
  );
}

export default StickyCtaBody;
