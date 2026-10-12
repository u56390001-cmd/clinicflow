/**
 * Brand asset pipeline — MedBook AI official logo package.
 *
 * Trims transparent padding from the supplied masters (keeping the original
 * artwork and aspect ratio), adds a small optical safety margin, and exports
 * optimized transparent PNG + WebP into a single centralized public directory
 * (`public/brand`). Also installs the provided favicon / app-icon assets using
 * Next.js App Router file conventions and the public PWA icon paths.
 *
 *   node scripts/prepare-brand-assets.mjs
 *
 * Source masters (unmodified originals) live in the supplied ZIP export:
 *   docs/MedBookAI_LOGOS_COMPLETE_NEW_VERIFIED (1)/
 */
import sharp from "sharp";
import { mkdirSync, copyFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SRC = "docs/MedBookAI_LOGOS_COMPLETE_NEW_VERIFIED (1)";
const OUT = "public/brand";

mkdirSync(OUT, { recursive: true });

const margin = (h) => Math.max(2, Math.round(h * 0.03));

async function emit(name, srcRel) {
  const src = join(SRC, srcRel);
  if (!existsSync(src)) throw new Error(`missing source: ${src}`);
  const trimmed = await sharp(src).ensureAlpha().trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;
  const m = margin(height);
  const padded = await sharp(trimmed.data)
    .extend({ top: m, bottom: m, left: m, right: m, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  writeFileSync(join(OUT, `${name}.png`), padded.data);
  writeFileSync(join(OUT, `${name}.webp`), await sharp(padded.data).webp({ quality: 92, alphaQuality: 100 }).toBuffer());
  console.log(`${name.padEnd(16)} content ${width}x${height} -> ${padded.info.width}x${padded.info.height}`);
}

await emit("wordmark", "02_Website_LandingPage_and_Dashboard/MedBookAI_WebsiteNavbar_Light_Logo_TRANSPARENT_1600x360.png");
await emit("wordmark-mobile", "02_Website_LandingPage_and_Dashboard/MedBookAI_Mobile_Header_Logo_TRANSPARENT_900x240.png");
await emit("wordmark-white", "02_Website_LandingPage_and_Dashboard/MedBookAI_Footer_DarkMode_WHITE_Logo_TRANSPARENT_1600x360.png");
await emit("icon", "02_Website_LandingPage_and_Dashboard/MedBookAI_Dashboard_Sidebar_IconOnly_TRANSPARENT_512x512.png");

const copies = [
  ["04_Favicons_App_Icons_and_Touch_Icons/favicon.ico", "app/favicon.ico"],
  ["04_Favicons_App_Icons_and_Touch_Icons/MedBookAI_AppIcon_SageBackground_512x512.png", "app/icon.png"],
  ["04_Favicons_App_Icons_and_Touch_Icons/apple-touch-icon.png", "app/apple-icon.png"],
  ["04_Favicons_App_Icons_and_Touch_Icons/android-chrome-192x192.png", "public/icons/icon-192.png"],
  ["04_Favicons_App_Icons_and_Touch_Icons/android-chrome-512x512.png", "public/icons/icon-512.png"],
];
for (const [from, to] of copies) {
  copyFileSync(join(SRC, from), to);
  console.log(`copied ${from} -> ${to}`);
}

console.log("Done.");
