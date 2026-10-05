"use client";

import { WebsiteLayout } from "@/components/website/template-layout";
import type { TemplateProps } from "@/components/website/template-index";

/**
 * Modern — the default. Colour-blocked surfaces, left-aligned headings,
 * generous rhythm. Reads as a modern private-practice site.
 */
export function TemplateModern({
  showHeader = true,
  ...props
}: TemplateProps) {
  return <WebsiteLayout {...props} variant="modern" showHeader={showHeader} />;
}
