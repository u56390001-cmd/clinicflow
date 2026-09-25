"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  CalendarCheck,
  CalendarDays,
  CreditCard,
  FileText,
  Globe,
  Inbox,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useHoverTip, type TipHandlers } from "@/components/ui/hover-tip";
import { useMobileNav } from "@/components/app/mobile-nav-context";
import { usePersistedBoolean } from "@/hooks/use-persisted-boolean";
import { logoutAction } from "@/lib/actions/auth";
import { APP_NAV_SECTIONS, APP_ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Remembered across sessions — see `usePersistedBoolean`. */
const SIDEBAR_COLLAPSED_KEY = "medbook-app-sidebar-collapsed";

const NAV_ICONS: Record<string, LucideIcon> = {
  [APP_ROUTES.app.dashboard]: LayoutDashboard,
  [APP_ROUTES.app.appointments]: CalendarCheck,
  [APP_ROUTES.app.calendar]: CalendarDays,
  [APP_ROUTES.app.inbox]: Inbox,
  [APP_ROUTES.app.patients]: Users,
  [APP_ROUTES.app.doctors]: Stethoscope,
  [APP_ROUTES.app.aiSettings]: Bot,
  [APP_ROUTES.app.website]: Globe,
  [APP_ROUTES.app.billing]: CreditCard,
  [APP_ROUTES.app.patientBilling]: FileText,
  [APP_ROUTES.app.settings]: Settings,
};

type ShowTip = (label: string, enabled?: boolean) => TipHandlers;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarHeader() {
  return (
    <div className="flex h-16 shrink-0 items-center border-b border-text-muted/30 px-4">
      <Link
        href={APP_ROUTES.app.dashboard}
        className="rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Wordmark className="text-lg" />
      </Link>
    </div>
  );
}

function SidebarNav({
  pathname,
  collapsed,
  tipProps,
}: {
  pathname: string;
  collapsed: boolean;
  tipProps: ShowTip;
}) {
  return (
    <nav
      aria-label="Main"
      className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
    >
      {/* Sections collapse into one run of icons, so the dividers below carry
          the grouping the section labels carry when expanded. */}
      <div className={collapsed ? "space-y-1" : "space-y-6"}>
        {APP_NAV_SECTIONS.map((section, sectionIndex) => (
          <div key={section.label}>
            {collapsed ? (
              sectionIndex > 0 ? (
                <div
                  className="mx-1 mb-2 h-px bg-text-muted/20"
                  aria-hidden="true"
                />
              ) : null
            ) : (
              <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
                {section.label}
              </p>
            )}
            <ul className={collapsed ? "space-y-1" : "space-y-0.5"}>
              {section.items.map((item) => {
                const Icon = NAV_ICONS[item.href];
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      {...tipProps(item.label, collapsed)}
                      className={cn(
                        "flex items-center rounded-control text-sm font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                        collapsed ? "h-10 justify-center px-0" : "gap-3 px-3 py-2",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-text-secondary hover:bg-app hover:text-text-primary",
                      )}
                    >
                      {Icon ? (
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                      ) : null}
                      {!collapsed && item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function SidebarFooter({
  userEmail,
  collapsed,
  tipProps,
}: {
  userEmail: string | null;
  collapsed: boolean;
  tipProps: ShowTip;
}) {
  return (
    <div className="shrink-0 border-t border-text-muted/30 p-2">
      {userEmail && !collapsed ? (
        <p
          title={userEmail}
          className="truncate px-1 pb-1.5 text-xs text-text-secondary"
        >
          {userEmail}
        </p>
      ) : null}
      <form action={logoutAction}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          aria-label={collapsed ? "Sign out" : undefined}
          {...tipProps("Sign out", collapsed)}
          className={cn(
            "w-full",
            collapsed ? "justify-center px-0" : "justify-start",
          )}
        >
          <LogOut aria-hidden="true" />
          {!collapsed && "Sign out"}
        </Button>
      </form>
    </div>
  );
}

export function AppSidebarShell({ userEmail }: { userEmail: string | null }) {
  const { open } = useMobileNav();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = usePersistedBoolean(
    SIDEBAR_COLLAPSED_KEY,
    false,
  );
  const { tipProps, hideTip, tooltip } = useHoverTip();

  useEffect(hideTip, [hideTip, pathname]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          !open && "pointer-events-none",
        )}
        inert={!open}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={() => {}}
          className={cn(
            "absolute inset-0 h-full w-full bg-secondary/50 transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-text-muted/30 bg-surface shadow-card transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <SidebarHeader />
          {/* The drawer stays full width: collapsing is a desktop concern, and
              a phone has no rail to save. */}
          <SidebarNav
            pathname={pathname}
            collapsed={false}
            tipProps={tipProps}
          />
          <SidebarFooter
            userEmail={userEmail}
            collapsed={false}
            tipProps={tipProps}
          />
        </aside>
      </div>

      <aside
        className={cn(
          "sticky hidden shrink-0 flex-col border-r border-text-muted/30 bg-surface md:flex",
          "top-[var(--app-header-h)] h-[calc(100svh_-_var(--app-header-h))]",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        <SidebarNav pathname={pathname} collapsed={collapsed} tipProps={tipProps} />

        <div className="shrink-0 border-t border-text-muted/30 p-2">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            {...tipProps(
              collapsed ? "Expand sidebar" : "Collapse sidebar",
              collapsed,
            )}
            className={cn(
              "flex h-9 w-full items-center rounded-control text-xs font-medium text-text-muted transition-colors hover:bg-app hover:text-text-primary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              collapsed ? "justify-center px-0" : "gap-2 px-2",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="size-4" aria-hidden="true" />
                <span>Collapse sidebar</span>
              </>
            )}
          </button>
        </div>

        <SidebarFooter
          userEmail={userEmail}
          collapsed={collapsed}
          tipProps={tipProps}
        />
      </aside>

      {tooltip}
    </>
  );
}
