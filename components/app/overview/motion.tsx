"use client";

import { motion } from "framer-motion";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Shared easing so every overview motion speaks the same language. */
export const MEDBOOK_EASE: [number, number, number, number] = [
  0.22, 0.61, 0.36, 1,
];

/**
 * One-shot entrance wrapper for the dashboard overview blocks. It is a client
 * boundary that renders server children, so sections stay server components
 * while the reveal itself is driven by Framer Motion.
 *
 * The initial render is identical on the server and the client (always
 * `opacity: 0, y: 10`) — branching it on `useReducedMotion()` is what produced
 * a hydration mismatch. Reduced-motion users are handled in CSS instead: the
 * `.medbook-motion` rule forces the settled state under
 * `prefers-reduced-motion`, overriding Framer's inline styles.
 */
export function Reveal({
  delay = 0,
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<typeof motion.div> & {
  delay?: number;
  children: ReactNode;
}) {
  return (
    <motion.div
      {...rest}
      className={cn("medbook-motion", className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: MEDBOOK_EASE, delay }}
    >
      {children}
    </motion.div>
  );
}
