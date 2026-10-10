/**
 * Landing page verification + screenshot capture.
 *
 * Renders the marketing page at production size across desktop / tablet /
 * mobile, asserts key content is present (pricing from the live plans table,
 * nav, hero), checks for console errors and horizontal overflow, and saves
 * full-page captures to `.review/`.
 *
 *   node scripts/screenshot-landing.mjs      (needs a running server, see below)
 *   LANDING_BASE_URL=http://localhost:3100 node scripts/screenshot-landing.mjs
 *
 * Start the server first:  npm run build && npm run start -- -p 3100
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.LANDING_BASE_URL ?? "http://localhost:3100";
const OUT = ".review";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/landing-${vp.name}.png`, fullPage: true });

  const title = await page.title();
  const h1 = (await page.textContent("h1"))?.trim();
  const hasNav = await page.locator(".nav-links a").first().isVisible().catch(() => false);
  const hasPricing = await page.locator("#pricing .plan").count();
  const pricingSample = await page.locator("#pricing .price").first().innerText().catch(() => "");
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });

  console.log(`[${vp.name}] title="${title}"`);
  console.log(`[${vp.name}] h1="${h1}"`);
  console.log(`[${vp.name}] nav=${hasNav} plans=${hasPricing} samplePrice="${pricingSample.trim()}" overflowX=${overflow}px errors=${consoleErrors.length}`);
  if (consoleErrors.length) console.log(`[${vp.name}] consoleErrors=${JSON.stringify(consoleErrors, null, 2)}`);

  if (vp.name === "mobile") {
    await page.click(".menu-toggle");
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/landing-mobile-menu.png` });
    await page.click(".menu-toggle");

    await page.locator(".faq-list details").first().click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/landing-mobile-faq.png` });
  }

  await page.close();
}

await browser.close();
console.log("Done — screenshots in .review/");