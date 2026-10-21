"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CircleHelp,
  CreditCard,
  FileText,
  Globe,
  Inbox,
  LayoutDashboard,
  Lock,
  Megaphone,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Puzzle,
  Send,
  Settings,
  Sparkles,
  Stethoscope,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHoverTip, type TipHandlers } from "@/components/ui/hover-tip";
import { useMobileNav } from "@/components/app/mobile-nav-context";
import { usePersistedBoolean } from "@/hooks/use-persisted-boolean";
import { APP_ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type NavSection = {
  label: string;
  items: ReadonlyArray<{ label: string; href: string; locked?: boolean }>;
};

type NavItem = { label: string; href: string; locked?: boolean };

/** Remembered across sessions — see `usePersistedBoolean`. */
const SIDEBAR_COLLAPSED_KEY = "medbook-app-sidebar-collapsed";

/** Pinned to the foot of the rail, above the collapse toggle and sign out. */
const FOOTER_HREFS: readonly string[] = [
  APP_ROUTES.app.settings,
  APP_ROUTES.app.support,
];

const NAV_ICONS: Record<string, LucideIcon> = {
  [APP_ROUTES.app.dashboard]: LayoutDashboard,
  [APP_ROUTES.app.appointments]: CalendarCheck,
  [APP_ROUTES.app.calendar]: CalendarDays,
  [APP_ROUTES.app.inbox]: Inbox,
  [APP_ROUTES.app.patients]: Users,
  [APP_ROUTES.app.doctors]: Stethoscope,
  [APP_ROUTES.app.aiSettings]: Bot,
  [APP_ROUTES.app.website]: Globe,
  [APP_ROUTES.app.bookingPage]: CalendarClock,
  [APP_ROUTES.app.growthAgent]: Megaphone,
  [APP_ROUTES.app.engagement]: Send,
  [APP_ROUTES.app.integrations]: Puzzle,
  [APP_ROUTES.app.addons]: Sparkles,
  [APP_ROUTES.app.billing]: CreditCard,
  [APP_ROUTES.app.patientBilling]: FileText,
  [APP_ROUTES.app.settings]: Settings,
  [APP_ROUTES.app.support]: CircleHelp,
  [APP_ROUTES.app.whatsapp]: MessageCircle,
};

type ShowTip = (label: string, enabled?: boolean) => TipHandlers;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  pathname,
  collapsed,
  tipProps,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  tipProps: ShowTip;
}) {
  const Icon = NAV_ICONS[item.href];
  const active = isActive(pathname, item.href);
  // A locked module points at the upgrade screen, so it is never "active".
  const locked = item.locked === true;

  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        {...tipProps(locked ? `${item.label} — not in your plan` : item.label, collapsed)}
        className={cn(
          "relative flex items-center rounded-control text-sm font-medium transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sage focus-visible:ring-offset-1",
          collapsed ? "h-10 justify-center px-0" : "gap-3 px-3 py-2.5",
          active
            ? "bg-brand-wash font-semibold text-brand-cta-hover before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-brand-cta"
            : locked
              ? "text-brand-faint hover:bg-brand-canvas hover:text-brand-muted"
              : "text-brand-muted hover:bg-brand-canvas hover:text-brand-ink",
        )}
      >
        {Icon ? (
          <Icon className="size-[18px] shrink-0" aria-hidden="true" />
        ) : null}
        {!collapsed && item.label}
        {locked && !collapsed ? (
          <Lock
            className="ml-auto size-3.5 shrink-0 text-brand-faint"
            aria-hidden="true"
          />
        ) : null}
      </Link>
    </li>
  );
}

function NavList({
  items,
  pathname,
  collapsed,
  tipProps,
}: {
  items: readonly NavItem[];
  pathname: string;
  collapsed: boolean;
  tipProps: ShowTip;
}) {
  return (
    <ul className={collapsed ? "space-y-1" : "space-y-0.5"}>
      {items.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
          collapsed={collapsed}
          tipProps={tipProps}
        />
      ))}
    </ul>
  );
}

function SidebarFooter({
  items,
  pathname,
  collapsed,
  tipProps,
  onToggle,
}: {
  items: readonly NavItem[];
  pathname: string;
  collapsed: boolean;
  tipProps: ShowTip;
  onToggle?: () => void;
}) {
  return (
    <div className="shrink-0 p-2 pt-1">
      <NavList
        items={items}
        pathname={pathname}
        collapsed={collapsed}
        tipProps={tipProps}
      />

      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse"}
          {...tipProps(collapsed ? "Expand sidebar" : "Collapse", collapsed)}
          className={cn(
            "mt-0.5 flex h-9 w-full items-center rounded-control text-brand-muted transition-colors hover:bg-brand-canvas hover:text-brand-ink",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sage",
            collapsed ? "justify-center px-0" : "gap-2 px-3",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="size-4" aria-hidden="true" />
              <span>Collapse</span>
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

export function AppSidebarShell({
  sections,
}: {
  sections: readonly NavSection[];
}) {
  const { open, setOpen } = useMobileNav();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = usePersistedBoolean(
    SIDEBAR_COLLAPSED_KEY,
    false,
  );
  const { tipProps, hideTip, tooltip } = useHoverTip();

  useEffect(hideTip, [hideTip, pathname]);

  // Flatten the role-filtered sections into one rail; the section labels are
  // intentionally not rendered. Settings + Help & Support are lifted out and
  // pinned to the foot of the rail.
  const items: NavItem[] = sections.flatMap((section) =>
    section.items.map((item) => ({ label: item.label, href: item.href })),
  );
  const footerItems = items.filter((item) => FOOTER_HREFS.includes(item.href));
  const mainItems = items.filter((item) => !FOOTER_HREFS.includes(item.href));

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
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 h-full w-full bg-secondary/50 transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          aria-label="Main navigation"
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-brand-line bg-surface shadow-card transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between border-b border-brand-line px-4 py-3">
            <span className="text-base font-semibold text-brand-ink">Menu</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              className="-mr-1 text-brand-muted hover:text-brand-ink"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <nav
            aria-label="Main"
            className="min-h-0 flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <NavList
              items={mainItems}
              pathname={pathname}
              collapsed={false}
              tipProps={tipProps}
            />
          </nav>
          <SidebarFooter
            items={footerItems}
            pathname={pathname}
            collapsed={false}
            tipProps={tipProps}
          />
        </aside>
      </div>

      <aside
        className={cn(
          "hidden h-full shrink-0 flex-col border-r border-brand-line bg-surface md:flex",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        <nav
          aria-label="Main"
          className="min-h-0 flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <NavList
            items={mainItems}
            pathname={pathname}
            collapsed={collapsed}
            tipProps={tipProps}
          />
        </nav>

        <SidebarFooter
          items={footerItems}
          pathname={pathname}
          collapsed={collapsed}
          tipProps={tipProps}
          onToggle={() => setCollapsed(!collapsed)}
        />
      </aside>

      {tooltip}
    </>
  );
}
