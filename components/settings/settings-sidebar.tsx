"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  FilePen,
  RefreshCw,
  Save,
  Tv,
  type LucideIcon,
} from "lucide-react";

import { SETTINGS_NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Icon map for `SETTINGS_NAV_ITEMS`, mirroring `NAV_ICONS` in the app sidebar:
 * the data module stays free of components and the map sits with the component
 * that draws it.
 */
const ICONS: Record<string, LucideIcon> = {
  building: Building2,
  refresh: RefreshCw,
  save: Save,
  "file-pen": FilePen,
  tv: Tv,
};

function isActive(pathname: string, item: (typeof SETTINGS_NAV_ITEMS)[number]) {
  if (pathname === item.href) return true;
  // Don't mark "Organization" as active when on a specific child tab
  // unless it's explicitly listed in alsoActiveAt.
  if (item.key === "organization") {
    const also = item.alsoActiveAt as readonly string[] | undefined;
    if (!also || also.length === 0) {
      return pathname === item.href;
    }
  }
  return item.alsoActiveAt.some((route) => pathname.startsWith(route));
}

/**
 * Left rail for the Settings tab.
 *
 * Horizontal scroller on a phone, vertical rail from `md` up — the two layouts
 * are the same DOM, so an item cannot drift between them as more sections are
 * added.
 *
 * The one deliberate flourish is the active row: a teal-tinted icon chip on a
 * teal wash. Everything else is flat, because a rail of five items with five
 * treatments is a decoration, and the doctor scanning it needs exactly one
 * thing to catch their eye.
 */
export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className={cn(
        "flex gap-1 overflow-x-auto rounded-card border border-hairline bg-surface p-2 shadow-card",
        "md:w-60 md:shrink-0 md:flex-col md:overflow-visible md:p-3",
      )}
    >
      {SETTINGS_NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.icon] ?? Building2;
        const active = isActive(pathname, item);
        const soon = item.comingSoon;

        const shell = cn(
          "group flex min-h-10 flex-shrink-0 items-center gap-2.5 rounded-control px-3 py-2.5 text-left",
          "transition-all duration-200 ease-out motion-reduce:transition-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          // Full width only from `md` up, where the rail is a column. On a
          // phone the row scrolls, and a base `w-full` would make every item
          // one screen wide — five screens of scroll for five short labels.
          "md:w-full md:flex-shrink",
          active
            ? "bg-primary/10 text-primary"
            : soon
              ? "text-text-muted"
              : "text-text-secondary hover:bg-skeleton hover:text-text-primary",
        );

        // The chip is what carries the active state — the wash alone is too
        // quiet at 15% to read as a selection on a bright clinic screen.
        const chip = cn(
          "flex size-7 shrink-0 items-center justify-center rounded-control transition-colors duration-200 motion-reduce:transition-none",
          active
            ? "bg-primary/15 text-primary"
            : soon
              ? "bg-skeleton/60 text-text-muted"
              : "bg-skeleton text-text-secondary group-hover:text-text-primary",
        );

        const label =
          "min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.01em] whitespace-nowrap";

        const body = (
          <>
            <span className={chip}>
              <Icon
                className="size-[14.5px]"
                strokeWidth={2.2}
                aria-hidden="true"
              />
            </span>
            <span className={label}>{item.label}</span>
          </>
        );

        if (soon) {
          return (
            <span
              key={item.key}
              className={shell}
              aria-disabled="true"
              title={`${item.label} is not set up yet`}
            >
              {body}
              <span
                aria-hidden="true"
                className="shrink-0 rounded-pill border border-text-muted/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted"
              >
                Soon
              </span>
            </span>
          );
        }

        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={shell}
          >
            {body}
          </Link>
        );
      })}
    </nav>
  );
}
