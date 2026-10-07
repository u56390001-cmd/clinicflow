"use strict";

/*
 * Minimal service worker.
 *
 * Its purpose here is twofold:
 *   1. Installability — Chromium only fires `beforeinstallprompt` when the
 *      page has a fetch-handling service worker. This worker's handler exists
 *      to satisfy that heuristic (Chrome ignores workers whose handlers never
 *      really fetch).
 *   2. A graceful fallback — if a network fetch fails, navigations return a
 *      small offline page instead of Chrome's error screen.
 *
 * The worker never writes to the cache, so it cannot serve stale assets.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request).catch(() => {
      const acceptHeader = request.headers.get("accept") ?? "";
      const wantsHtml = request.mode === "navigate" || acceptHeader.includes("text/html");
      if (!wantsHtml) {
        return new Response("", { status: 503, statusText: "Offline" });
      }
      return new Response(
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><title>Offline — MedBook AI</title><body style=\"font-family:system-ui,sans-serif;padding:3rem;text-align:center\"><h1>You are offline</h1><p>MedBook AI needs a connection. Please reconnect and try again.</p></body></html>",
        { status: 503, statusText: "Offline", headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }),
  );
});