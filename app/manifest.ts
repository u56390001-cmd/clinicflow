import type { MetadataRoute } from "next";

import { APP_ROUTES } from "@/lib/constants";

/**
 * Web app manifest. Its presence is what makes the app *installable*: browsers
 * only fire `beforeinstallprompt` and honour `display-mode: standalone` when a
 * manifest declaring a `display`, `start_url` and `icons` is linked. The
 * manifest is injected automatically by Next.js whenever this route exists.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MedBook AI — Clinic Management",
    short_name: "MedBookAI",
    description:
      "MedBook AI — appointments, patients, queueing, prescriptions and AI assistance for your clinic.",
    start_url: APP_ROUTES.app.dashboard,
    scope: "/app",
    display: "standalone",
    background_color: "#F9FAFB",
    theme_color: "#0D9488",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}