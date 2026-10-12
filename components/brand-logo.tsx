import Image from "next/image";

import {
  BRAND_ALT,
  BRAND_ASSETS,
  type BrandAssetKey,
} from "@/lib/brand-assets";
import { cn } from "@/lib/utils";

/**
 * The single way the MedBook AI logo is rendered across the product.
 *
 * Each variant maps to an approved artwork file and a sensible optical height,
 * so call sites pick a *role* (where the logo sits) rather than re-deriving
 * dimensions. The artwork is always scaled by height with an automatic width,
 * which guarantees the aspect ratio is never distorted.
 *
 *   header        — marketing navbar wordmark (dark, on light)
 *   mobile        — compact navbar wordmark for narrow screens
 *   dashboard     — wordmark for the expanded app sidebar / header
 *   icon          — symbol-only mark for collapsed rails and tight slots
 *   footer-light  — green wordmark on a light background
 *   footer-dark   — white wordmark on a dark background
 */
export type BrandLogoVariant =
  | "header"
  | "mobile"
  | "dashboard"
  | "icon"
  | "footer-light"
  | "footer-dark";

const VARIANT_ASSET: Record<BrandLogoVariant, BrandAssetKey> = {
  header: "wordmark",
  mobile: "wordmark-mobile",
  dashboard: "wordmark",
  icon: "icon",
  "footer-light": "wordmark",
  "footer-dark": "wordmark-white",
};

/**
 * Optical heights (CSS px) tuned to read at the intended weight in each slot.
 * The masters carry a small transparent safety margin, so the visible artwork
 * sits a few percent smaller than these values.
 */
const VARIANT_HEIGHT: Record<BrandLogoVariant, number> = {
  header: 34,
  mobile: 24,
  dashboard: 28,
  icon: 32,
  "footer-light": 28,
  "footer-dark": 28,
};

export function BrandLogo({
  variant = "header",
  height,
  className,
  priority = false,
  alt = BRAND_ALT,
}: {
  variant?: BrandLogoVariant;
  height?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  const asset = BRAND_ASSETS[VARIANT_ASSET[variant]];
  // Callers that know the exact size pass `height` (a literal value wins).
  // Otherwise the rendered height reads `--brand-h`, letting stylesheets —
  // including media queries — retune the logo without fighting inline styles.
  const style =
    height != null
      ? { height, width: "auto" as const }
      : {
          height: `var(--brand-h, ${VARIANT_HEIGHT[variant]}px)`,
          width: "auto" as const,
        };
  return (
    <Image
      src={asset.src}
      alt={alt}
      width={asset.width}
      height={asset.height}
      priority={priority}
      style={style}
      className={cn("block select-none", className)}
    />
  );
}
