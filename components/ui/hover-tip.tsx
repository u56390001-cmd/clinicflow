"use client";

import {
  useCallback,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type HoverTip = { label: string; top: number; left: number } | null;

export type TipHandlers = Partial<{
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
}>;

/**
 * Tooltip for icon-only controls.
 *
 * The two rails this serves (the app nav, the collapsed patient queue) both
 * scroll, and a tooltip inside a scrolling box is clipped the moment it crosses
 * the box edge — so it is portalled to `document.body` and positioned from the
 * anchor's viewport box. `tipProps` returns no-op handlers when disabled, so
 * callers can spread one set of props whether or not the control is compact.
 */
export function useHoverTip() {
  const [tip, setTip] = useState<HoverTip>(null);

  const hideTip = useCallback(() => setTip(null), []);

  const tipProps = useCallback((label: string, enabled = true): TipHandlers => {
    if (!enabled) return {};
    const anchor = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      setTip({ label, top: box.top + box.height / 2, left: box.right + 10 });
    };
    return {
      onMouseEnter: (event) => anchor(event.currentTarget),
      onMouseLeave: () => setTip(null),
      onFocus: (event) => anchor(event.currentTarget),
      onBlur: () => setTip(null),
    };
  }, []);

  const tooltip: ReactNode = tip
    ? createPortal(
        <span
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-control bg-secondary px-2 py-1 text-[11px] font-medium text-white shadow-dropdown"
        >
          {tip.label}
        </span>,
        document.body,
      )
    : null;

  return { tipProps, hideTip, tooltip };
}
