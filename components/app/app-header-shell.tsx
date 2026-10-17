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
  canCreateAppointment = false,
  notifications = [],
  conversations = [],
  clinicId = null,
  clinicLogoUrl = null,
}: {
  userEmail: string | null;
  userName: string | null;
  role?: ClinicRole | null;
  /**
   * Whether the member may create appointments. Resolved on the server from
   * the same `canManageClinical` rule the dashboard used, so the header action
   * is the single "New appointment" entry point and stays permission-correct.
   */
  canCreateAppointment?: boolean;
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
   * rows whose height varies by breakpoint. Panels that size themselves against
   * the viewport (the website builder, the patient workspace panes, the
   * prescription workspace) subtract it, so they need the real number rather
   * than a hard-coded 64px guess.
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
      className="relative z-30 shrink-0 bg-surface/95 backdrop-blur"
    >
      {/* ── Row 1: Logo · Search · Chat · Notifications · User ── */}
      <div className="flex items-center justify-between gap-2 border-b border-brand-line px-3 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
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
                  is not in the header, so there is nothing further to convey.
                  Hidden on the narrowest phones where the row would otherwise
                  crowd the search / notifications / profile controls. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={clinicLogoUrl}
                alt=""
                className="border-border-light hidden size-8 shrink-0 rounded-control border object-cover sm:block"
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
            <Wordmark height={28} />
          </Link>
        </div>

        <div className="mx-auto hidden w-full max-w-md md:block">
          <HeaderPatientSearch />
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
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

          {/* Inbox also lives in the sidebar, so on the narrowest phones this
              header shortcut yields its space to search, notifications and the
              profile rather than squeezing every control. */}
          <div className="hidden sm:block">
            <MessagesLink unreadCount={unreadConversationCount} />
          </div>

          <NotificationBell notifications={notifications} clinicId={clinicId} />

          <ProfileDropdown user={{ name: userName, email: userEmail, role }} />
        </div>
      </div>

      {/* ── Row 2: Tabs (left) · New Appointment (right) ── */}
      <div className="flex items-center justify-between gap-2 border-b border-brand-line px-3 py-2 sm:px-6">
        <nav aria-label="Dashboard views" className="flex items-center gap-1">
          <Link
            href={APP_ROUTES.app.dashboard}
            aria-current={isDashboardArea ? "page" : undefined}
            className={cn(
              "px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isDashboardArea
                ? "border-b-2 border-brand-cta font-semibold text-brand-ink"
                : "border-b-2 border-transparent text-brand-muted hover:text-brand-ink",
            )}
          >
            Dashboard
          </Link>
          <span
            aria-disabled="true"
            title="Analytics dashboard coming soon"
            className="hidden cursor-not-allowed px-3 py-1.5 text-sm font-medium text-text-muted sm:block"
          >
            Analytics
          </span>
        </nav>

        {canCreateAppointment ? (
          <Link
            href={`${APP_ROUTES.app.appointments}?new=consultation`}
            className="medbook-btn-lift group inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-brand-cta px-4 py-2.5 text-sm font-semibold text-white shadow-[0_3px_10px_rgba(63,111,93,0.18)] transition-colors hover:bg-brand-cta-hover active:scale-[0.98]"
          >
            <Plus
              aria-hidden="true"
              className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90"
            />
            New appointment
          </Link>
        ) : null}
      </div>
    </header>
  );
}
