/**
 * Central registry for the official MedBook AI logo artwork.
 *
 * Every brand surface (marketing site, app chrome, auth/intake pages, favicons)
 * resolves its artwork through this map so the logo is defined once and swapped
 * everywhere. Files are produced by `scripts/prepare-brand-assets.mjs` from the
 * approved masters and live under `public/brand`.
 *
 * `width`/`height` are the intrinsic pixel dimensions of each asset; they are
 * used only to reserve layout space and preserve the aspect ratio. Never stretch
 * these — always scale by a single edge.
 */
export type BrandAssetKey =
  | "wordmark"
  | "wordmark-mobile"
  | "wordmark-white"
  | "icon";

export const BRAND_ASSETS: Record<
  BrandAssetKey,
  { src: string; width: number; height: number }
> = {
  wordmark: { src: "/brand/wordmark.png", width: 1465, height: 272 },
  "wordmark-mobile": {
    src: "/brand/wordmark-mobile.png",
    width: 824,
    height: 151,
  },
  "wordmark-white": {
    src: "/brand/wordmark-white.png",
    width: 1451,
    height: 269,
  },
  icon: { src: "/brand/icon.png", width: 427, height: 276 },
};

export const BRAND_ALT = "MedBook AI";
