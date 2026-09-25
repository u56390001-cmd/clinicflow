"use client";

import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/auth";
import { APP_ROUTES } from "@/lib/constants";

function initialsOf(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "?";
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
  }
  return source.slice(0, 1).toUpperCase();
}

const menuItemClasses =
  "flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-sm font-medium text-text-primary transition-colors hover:bg-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export function UserMenu({
  userEmail,
  userName,
}: {
  userEmail: string | null;
  userName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
        className="gap-2 px-2"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-primary text-sm font-semibold text-white"
        >
          {initialsOf(userName, userEmail)}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
          {userName ?? userEmail ?? "Account"}
        </span>
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-card border border-text-muted/30 bg-surface shadow-dropdown"
        >
          <div className="border-b border-text-muted/20 px-4 py-3">
            <p className="truncate text-sm font-semibold text-text-primary">
              {userName ?? "Signed in"}
            </p>
            {userEmail ? (
              <p className="mt-0.5 truncate text-xs text-text-secondary">
                {userEmail}
              </p>
            ) : null}
          </div>
          <div className="p-1.5">
            <Link
              role="menuitem"
              href={APP_ROUTES.app.settings}
              onClick={() => setOpen(false)}
              className={menuItemClasses}
            >
              <Settings className="size-4 shrink-0" aria-hidden="true" />
              Settings
            </Link>
            <form action={logoutAction}>
              <button type="submit" role="menuitem" className={menuItemClasses}>
                <LogOut className="size-4 shrink-0" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
