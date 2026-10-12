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
  type LucideIcon,
} from "lucide-react";

import { useHoverTip, type TipHandlers } from "@/components/ui/hover-tip";
import { useMobileNav } from "@/components/app/mobile-nav-context";
import { usePersistedBoolean } from "@/hooks/use-persisted-boolean";
import { APP_ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type NavSection = {
  label: string;
  items: ReadonlyArray<{ label: string; href: string }>;
};

type NavItem = { label: string; href: string };

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

  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        {...tipProps(item.label, collapsed)}
        className={cn(
          "flex items-center rounded-control text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sage",
          collapsed ? "h-10 justify-center px-0" : "gap-3 px-3 py-2",
          active
            ? "bg-brand-forest font-semibold text-white shadow-[0_3px_10px_-4px_rgba(19,47,34,0.5)]"
            : "text-brand-muted hover:bg-brand-pale hover:text-brand-forest",
        )}
      >
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
        {!collapsed && item.label}
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
          {...tipProps(
            collapsed ? "Expand sidebar" : "Collapse",
            collapsed,
          )}
          className={cn(
            "mt-0.5 flex h-9 w-full items-center rounded-control text-brand-muted transition-colors hover:bg-brand-pale hover:text-brand-forest",
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
  const { open } = useMobileNav();
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
          onClick={() => {}}
          className={cn(
            "absolute inset-0 h-full w-full bg-secondary/50 transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-brand-line bg-surface shadow-card transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
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
          "sticky hidden shrink-0 flex-col border-r border-brand-line bg-surface md:flex",
          "top-[var(--app-header-h)] h-[calc(100svh_-_var(--app-header-h))]",
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
