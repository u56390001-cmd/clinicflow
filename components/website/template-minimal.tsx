"use client";

import { WebsiteLayout } from "@/components/website/template-layout";
import type { TemplateProps } from "@/components/website/template-index";

/**
 * Minimal — one column, no surface changes, tight rhythm, no header band.
 * For a single specialist whose content is short enough that decoration would
 * only get in the way of the booking button.
 */
export function TemplateMinimal({
  showHeader = true,
  ...props
}: TemplateProps) {
  return <WebsiteLayout {...props} variant="minimal" showHeader={showHeader} />;
}
