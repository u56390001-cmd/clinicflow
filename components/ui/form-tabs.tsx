"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Sticky, centered pill navigation used by the edit popups (doctor / service).
 * Mirrors the tab bar from the `edit doctor profile popup` mockup: a soft
 * pill track under a translucent bar that stays put while the tab body
 * scrolls. The active pill lifts onto a white chip with a shadow.
 */
export function FormTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<{ id: T; label: string; icon: LucideIcon }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="sticky top-0 z-10 border-b border-text-muted/15 bg-app/95 px-5 py-3 backdrop-blur">
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full bg-secondary/5 p-1 ring-1 ring-text-muted/20">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 sm:gap-2 sm:px-5",
                active === tab.id
                  ? "bg-white text-primary shadow-md"
                  : "text-text-muted hover:text-text-secondary",
              )}
            >
              <tab.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}