import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

/**
 * Backwards-compatible brand helpers. Both now render the official MedBook AI
 * artwork through `BrandLogo` (see `lib/brand-assets.ts`) rather than the old
 * placeholder mark, so every existing call site picks up the real logo.
 */

export function Logo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const height = { sm: 24, md: 32, lg: 40 }[size];
  return (
    <BrandLogo
      variant="icon"
      height={height}
      className={cn("shrink-0", className)}
    />
  );
}

export function Wordmark({
  className,
  height = 26,
}: {
  className?: string;
  height?: number;
}) {
  return (
    <BrandLogo variant="header" height={height} className={className} />
  );
}
