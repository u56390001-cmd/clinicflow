"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { MEDBOOK_EASE } from "./motion";

/**
 * Count-up number used by the overview KPIs, driven by Framer Motion's
 * `animate`. Renders `0` (or the em-dash fallback) on the server and first
 * client paint so hydration always matches, then eases to the real value.
 * Reduced-motion users see the settled value immediately; screen readers always
 * get the final number via a visually hidden sibling.
 */
export function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  duration = 0.9,
  className,
}: {
  value: number | null;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === null) return;

    if (reduce) {
      setDisplay(value);
      return;
    }

    const controls = animate(0, value, {
      duration,
      ease: MEDBOOK_EASE,
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });

    return () => controls.stop();
  }, [value, duration, reduce]);

  if (value === null) {
    return <span className={className}>—</span>;
  }

  return (
    <span className={className}>
      <span aria-hidden="true">
        {prefix}
        {display}
        {suffix}
      </span>
      <span className="sr-only">
        {prefix}
        {value}
        {suffix}
      </span>
    </span>
  );
}
