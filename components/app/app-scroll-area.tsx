"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * The app shell is a fixed viewport: the header and sidebar never scroll and
 * this panel owns the page scroll instead of `window`. Next.js resets the
 * window scroll on navigation, which no longer does anything, so this resets
 * the panel to the top whenever the route changes.
 */
export function AppScrollArea({ children }: { children: React.ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div
      ref={panelRef}
      className="min-w-0 flex-1 overflow-y-auto overscroll-contain"
    >
      {children}
    </div>
  );
}
