"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  patientDirectoryHref,
  PATIENT_TAB_LABELS,
  type PatientDirectoryParams,
  type PatientTab,
} from "@/lib/patient-directory";
import {
  GENERAL_TAB_IDS,
  SPECIALTY_TAB_LABELS,
  type PatientTabId,
  type SpecialtyTabId,
  type WorkspaceConfig,
} from "@/lib/specialty-workspaces";
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
  workspace,
  params,
  activeTab,
}: {
  /**
   * The workspace owns the tab set. General shows the classic six; a specialty
   * workspace shows its own tabs (psych/derm are distinct URL ids, admitted by
   * the shared `PatientTabId` union so the record keeps one URL-driven system).
   */
  workspace: WorkspaceConfig;
  params: PatientDirectoryParams;
  /** The tab the record resolved for this workspace (never a foreign id). */
  activeTab: PatientTabId;
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

  useLayoutEffect(measure, [measure, activeTab]);

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
  }, [measure, activeTab]);

  const isGeneral = workspace.kind === "general";
  const tabs = (
    isGeneral ? (GENERAL_TAB_IDS as readonly PatientTabId[]) : (workspace.tabs ?? [])
  ) as readonly PatientTabId[];
  const labelOf = (tab: PatientTabId) =>
    isGeneral
      ? PATIENT_TAB_LABELS[tab as PatientTab]
      : SPECIALTY_TAB_LABELS[tab as SpecialtyTabId];

  return (
    <div className="border-b-[0.5px] border-hairline bg-surface sm:px-[26px]">
      <div
        ref={tabsRef}
        role="tablist"
        aria-label="Patient record sections"
        className="scrollbar-none relative flex overflow-x-auto px-3 sm:px-0"
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

        {tabs.map((tab) => {
          const active = activeTab === tab;
          return (
            <Link
              key={tab}
              role="tab"
              aria-selected={active}
              href={patientDirectoryHref({ ...params, tab })}
              scroll={false}
              className={cn(
                "whitespace-nowrap px-[15px] py-3.5 text-[13px] transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                active
                  ? "font-semibold text-primary"
                  : "font-normal text-ink-soft hover:text-ink/70",
              )}
            >
              {labelOf(tab)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
