"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/** The anchor is kept so the tip can be dropped once its control is gone. */
type HoverTip = {
  label: string;
  top: number;
  left: number;
  anchor: HTMLElement;
} | null;

/** How often to notice an anchor that vanished mid-hover. */
const ANCHOR_WATCH_MS = 100;

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

  // A portalled tip is only ever torn down by `mouseleave`/`blur`, and neither
  // fires when the anchor leaves the DOM under a stationary pointer — clicking
  // a collapse toggle, a re-render that swaps the control out, a navigation.
  // The tip then survives its own anchor and sticks to the viewport. Watch the
  // anchor and drop the tip as soon as it is detached. Scroll and resize move
  // the anchor without firing either event, and the tip is positioned from the
  // anchor's viewport box, so it would float free of its control.
  useEffect(() => {
    if (!tip) return;
    const { anchor } = tip;
    const drop = () => setTip(null);
    const watch = setInterval(() => {
      if (!anchor.isConnected) drop();
    }, ANCHOR_WATCH_MS);
    window.addEventListener("scroll", drop, true);
    window.addEventListener("resize", drop);
    return () => {
      clearInterval(watch);
      window.removeEventListener("scroll", drop, true);
      window.removeEventListener("resize", drop);
    };
  }, [tip]);

  const tipProps = useCallback((label: string, enabled = true): TipHandlers => {
    if (!enabled) return {};
    const anchor = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      setTip({ label, top: box.top + box.height / 2, left: box.right + 10, anchor: element });
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
