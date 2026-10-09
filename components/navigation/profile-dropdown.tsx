"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Check, Info, Laptop, LogOut, Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/auth/rbac-config";
import { APP_ROUTES } from "@/lib/constants";
import {
  clearDeferredPrompt,
  getInstallState,
  markInstalled,
  subscribeInstall,
} from "@/lib/pwa-install";
import { cn } from "@/lib/utils";
import type { ClinicRole } from "@/types/database";

interface UserProfile {
  name: string | null;
  email: string | null;
  role: ClinicRole | null;
}

interface ProfileDropdownProps {
  user: UserProfile;
}

type Notice = {
  kind: "success" | "info";
  message: string;
};

const ROLE_BADGE_LABELS = ROLE_LABELS;

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
  "flex cursor-pointer items-center gap-3 rounded-control px-3 py-2.5 text-sm transition-colors";

export function ProfileDropdown({ user }: ProfileDropdownProps) {
  const router = useRouter();

  const { deferredPrompt, isInstalled, isIOS } = useSyncExternalStore(
    subscribeInstall,
    getInstallState,
    getInstallState,
  );

  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const showNotice = useCallback((kind: Notice["kind"], message: string) => {
    setNotice({ kind, message });
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, 6000);
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (isInstalled) {
      showNotice("info", "MedBookAI is already installed on your device.");
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        markInstalled();
        showNotice("success", "Thank you for installing MedBookAI!");
      } else {
        clearDeferredPrompt();
      }
      return;
    }

    if (isIOS) {
      showNotice(
        "info",
        "To install MedBookAI on iOS, tap the Share button and select 'Add to Home Screen'.",
      );
      return;
    }

    showNotice(
      "info",
      "To install MedBookAI, click the browser menu (⋮ or ⋯) and choose 'Install MedBookAI'.",
    );
  }, [deferredPrompt, isIOS, isInstalled, showNotice]);

  const name = user.name?.trim() || user.email?.trim() || "Account";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label="User profile menu"
            className="gap-2 px-2"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-primary text-sm font-semibold text-white"
            >
              {initialsOf(user.name, user.email)}
            </span>
            <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
              {name}
            </span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-64 rounded-card shadow-dropdown"
        >
          {/* ── User details header ── */}
          <div className="border-b border-text-muted/20 px-4 py-3">
            <p className="truncate text-sm font-semibold text-text-primary">
              {user.name ?? "My Account"}
            </p>
            <div className="mt-1 flex items-center gap-2">
              {user.role ? (
                <Badge>{ROLE_BADGE_LABELS[user.role]}</Badge>
              ) : null}
              {user.email ? (
                <p className="min-w-0 truncate text-xs text-text-secondary">
                  {user.email}
                </p>
              ) : null}
            </div>
          </div>

          <div className="p-1.5">
            <DropdownMenuItem
              onSelect={() => router.push(APP_ROUTES.app.settings)}
              className={cn(
                menuItemClasses,
                "text-text-primary hover:bg-app focus:bg-app",
              )}
            >
              <Settings
                className="size-4 shrink-0 text-text-secondary"
                aria-hidden="true"
              />
              Settings
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={handleInstallClick}
              className={cn(
                menuItemClasses,
                "font-medium text-primary hover:bg-primary/5 focus:bg-primary/5",
              )}
            >
              {isInstalled ? (
                <Check className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Laptop className="size-4 shrink-0" aria-hidden="true" />
              )}
              {isInstalled ? "MedBookAI Installed ✓" : "Install MedBookAI"}
            </DropdownMenuItem>
          </div>

          <DropdownMenuSeparator />

          <form action={logoutAction} className="p-1.5 pt-0">
            <DropdownMenuItem asChild>
              <button
                type="submit"
                className={cn(
                  menuItemClasses,
                  "w-full font-medium text-rose-600 hover:bg-rose-50 focus:bg-rose-50",
                )}
              >
                <LogOut
                  className="size-4 shrink-0 text-rose-500"
                  aria-hidden="true"
                />
                Logout
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>

      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-2.5 rounded-card bg-slate-900 px-3.5 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          {notice.kind === "success" ? (
            <Check className="size-4 shrink-0 text-emerald-400" aria-hidden="true" />
          ) : (
            <Info className="size-4 shrink-0 text-sky-400" aria-hidden="true" />
          )}
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {notice.message}
          </span>
        </div>
      ) : null}
    </>
  );
}