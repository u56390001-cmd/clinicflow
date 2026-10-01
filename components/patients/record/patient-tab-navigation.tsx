"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  patientDirectoryHref,
  PATIENT_TABS,
  PATIENT_TAB_LABELS,
  type PatientDirectoryParams,
  type PatientTab,
} from "@/lib/patient-directory";
import { cn } from "@/lib/utils";

const EASE = "left 0.28s cubic-bezier(0.4, 0, 0.2, 1), width 0.28s cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * Record tab strip with a sliding underline, mirroring `docs/pt001.txt`.
 *
 * The indicator is measured from the active tab's own box rather than computed
 * from a hardcoded width, so it stays correct across the responsive label set
 * and never drifts after a resize, a font swap, or a wrapped tab row. Measuring
 * is a layout read, hence `useLayoutEffect` — a `useEffect` would paint the bar
 * at its previous position for one frame on every tab change.
 */
export function PatientTabNavigation({
  params,
}: {
  params: PatientDirectoryParams;
}) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const measure = useCallback(() => {
    const active = tabsRef.current?.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    if (!active) return;
    setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
  }, []);

  useLayoutEffect(measure, [measure, params.tab]);

  useEffect(() => {
    // Label widths depend on the loaded font and the row reflows on resize;
    // both leave the measured box stale.
    const remeasure = () => {
      if (typeof document !== "undefined" && "fonts" in document) {
        document.fonts.ready.then(measure).catch(() => {});
      }
    };
    remeasure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, params.tab]);

  return (
    <div className="border-b-[0.5px] border-hairline bg-surface px-[26px]">
      <div
        ref={tabsRef}
        role="tablist"
        aria-label="Patient record sections"
        className="scrollbar-none relative flex overflow-x-auto"
      >
        <span
          aria-hidden="true"
          style={{
            left: indicator.left,
            width: indicator.width,
            transition: EASE,
          }}
          className="absolute bottom-0 h-0.5 rounded-full bg-primary"
        />

        {PATIENT_TABS.map((tab: PatientTab) => {
          const active = params.tab === tab;
          return (
            <Link
              key={tab}
              role="tab"
              aria-selected={active}
              href={patientDirectoryHref({ ...params, tab })}
              scroll={false}
              className={cn(
                "whitespace-nowrap px-[15px] py-3 text-[12.5px] transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                active
                  ? "font-semibold text-primary"
                  : "font-normal text-ink-soft hover:text-ink/70",
              )}
            >
              {PATIENT_TAB_LABELS[tab]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
