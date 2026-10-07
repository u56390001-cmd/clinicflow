"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus, Search, X } from "lucide-react";

import { HeaderPatientSearch } from "@/components/app/header-patient-search";
import { MessagesLink } from "@/components/app/messages-link";
import { useMobileNav } from "@/components/app/mobile-nav-context";
import { NotificationBell } from "@/components/app/notification-bell";
import { Wordmark } from "@/components/brand";
import { ProfileDropdown } from "@/components/navigation/profile-dropdown";
import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants";
import type {
  HeaderConversation,
  HeaderNotification,
} from "@/lib/header-activity";
import { cn } from "@/lib/utils";
import type { ClinicRole } from "@/types/database";

export function AppHeaderShell({
  userEmail,
  userName,
  role = null,
  notifications = [],
  conversations = [],
  clinicId = null,
  clinicLogoUrl = null,
}: {
  userEmail: string | null;
  userName: string | null;
  role?: ClinicRole | null;
  notifications?: HeaderNotification[];
  conversations?: HeaderConversation[];
  clinicId?: string | null;
  /**
   * Clinic logo for the top-left brand slot. Null when the clinic has not set
   * one, in which case nothing is rendered — a permanent placeholder icon in the
   * header would be noise on every page of every clinic that never uploads one.
   */
  clinicLogoUrl?: string | null;
}) {
  const { open, setOpen } = useMobileNav();
  const pathname = usePathname();

  const isDashboardArea = pathname === APP_ROUTES.app.dashboard;
  const unreadConversationCount = conversations.filter((c) => c.unread).length;

  /**
   * Publish the header's measured height as `--app-header-h`. The header is two
   * rows whose height depends on the breakpoint, so anything that has to begin
   * *below* it (sticky rails, the fixed patient header) needs the real number
   * rather than a hard-coded 64px guess.
   */
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-app-header]");
    if (!header) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        "--app-header-h",
        `${header.offsetHeight}px`,
      );
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <header
      data-app-header
      className="sticky top-0 z-30 shrink-0 bg-surface/95 backdrop-blur"
    >
      {/* ── Row 1: Logo · Search · Chat · Notifications · User ── */}
      <div className="border-border-light flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>

          {clinicLogoUrl && (
            <>
              {/* Decorative: the wordmark link beside it already labels this
                  region as "MedBook AI home", so an alt text here would only
                  add a second, redundant announcement. The clinic's own name
                  is not in the header, so there is nothing further to convey. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={clinicLogoUrl}
                alt=""
                className="border-border-light size-8 shrink-0 rounded-control border object-cover"
              />
              <span
                aria-hidden="true"
                className="bg-border-light hidden h-6 w-px sm:block"
              />
            </>
          )}

          <Link
            href={APP_ROUTES.app.dashboard}
            aria-label="MedBook AI home"
            className="shrink-0 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Wordmark className="text-lg" />
          </Link>
        </div>

        <div className="mx-auto hidden w-full max-w-md md:block">
          <HeaderPatientSearch />
        </div>

        <div className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="md:hidden"
            title="Search patients"
          >
            <Link href={APP_ROUTES.app.patients} aria-label="Search patients">
              <Search aria-hidden="true" />
            </Link>
          </Button>

          <MessagesLink unreadCount={unreadConversationCount} />

          <NotificationBell notifications={notifications} clinicId={clinicId} />

          <ProfileDropdown
            user={{ name: userName, email: userEmail, role }}
          />
        </div>
      </div>

      {/* ── Row 2: Tabs (left) · New Appointment (right) ── */}
      <div className="border-border-light flex items-center justify-between border-b px-6 py-2">
        <nav aria-label="Dashboard views" className="flex items-center gap-1">
          <Link
            href={APP_ROUTES.app.dashboard}
            aria-current={isDashboardArea ? "page" : undefined}
            className={cn(
              "px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isDashboardArea
                ? "border-b-2 border-primary font-semibold text-text-primary"
                : "border-b-2 border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            Dashboard
          </Link>
          <span
            aria-disabled="true"
            title="Analytics dashboard coming soon"
            className="cursor-not-allowed px-3 py-1.5 text-sm font-medium text-text-muted"
          >
            Analytics
          </span>
        </nav>

        <Button asChild>
          <Link href={`${APP_ROUTES.app.appointments}?new=consultation`}>
            <Plus aria-hidden="true" className="mr-1.5" />
            New Appointment
          </Link>
        </Button>
      </div>
    </header>
  );
}
