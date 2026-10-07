"use client";

import { useEffect } from "react";

function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in window.navigator)) return;
  window.navigator.serviceWorker.register("/sw.js").catch(() => {
    // A failed registration only loses offline fallback + the native install
    // prompt; it must never break the app.
  });
}

export function PwaInstallListener() {
  useEffect(() => {
    if (document.readyState === "complete") {
      registerServiceWorker();
      return;
    }
    window.addEventListener("load", registerServiceWorker);
    return () => window.removeEventListener("load", registerServiceWorker);
  }, []);

  return null;
}