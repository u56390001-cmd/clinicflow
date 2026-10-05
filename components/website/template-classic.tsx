"use client";

import { WebsiteLayout } from "@/components/website/template-layout";
import type { TemplateProps } from "@/components/website/template-index";

/**
 * Classic — centred headings, serif display face, hairline-ruled sections.
 * Aimed at an established practice that wants the page to feel institutional
 * rather than startup.
 */
export function TemplateClassic({
  showHeader = true,
  ...props
}: TemplateProps) {
  return <WebsiteLayout {...props} variant="classic" showHeader={showHeader} />;
}
