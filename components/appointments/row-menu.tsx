"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type RowMenuAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
};

/**
 * Generic three-dot overflow menu used by the Today queue rows. Each call site
 * supplies the exact action list for its section (Not Yet Arrived, Waiting
 * Queue, In Consultation), so no two sections need identical menus.
 */
export function RowMenu({
  actions,
  align = "right",
  icon: TriggerIcon = MoreHorizontal,
  triggerClassName,
}: {
  actions: RowMenuAction[];
  align?: "left" | "right";
  icon?: LucideIcon;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`${triggerClassName ?? "flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-app hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"}`}
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <TriggerIcon className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-40 mt-1 w-52 overflow-hidden rounded-md border border-text-muted/30 bg-white shadow-dropdown ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  action.onClick();
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-app ${
                  action.destructive
                    ? "text-status-destructive"
                    : "text-text-primary"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}