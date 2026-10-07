"use client";

/**
 * Shared PWA-install state.
 *
 * `beforeinstallprompt` is a one-shot, fire-and-forget window event: it is
 * emitted (at most once) the moment the browser decides the page is
 * installable, which can happen while the app is still loading — before any
 * React effect has had a chance to attach a listener. If we miss it, the
 * browser will never hand us the prompt again and our "Install" button can
 * only ever show instructions.
 *
 * So instead of listening from inside a component, the listener below is
 * attached at *module scope*: the moment this bundle evaluates in the browser
 * (which is earlier than hydration), we are already holding the event. The
 * header's profile dropdown then reads it through `useSyncExternalStore`.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState = {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
  isIOS: boolean;
};

const listeners = new Set<() => void>();

let state: InstallState = {
  deferredPrompt: null,
  isInstalled: false,
  isIOS: false,
};

function notify(): void {
  listeners.forEach((listener) => listener());
}

function setState(patch: Partial<InstallState>): void {
  state = { ...state, ...patch };
  notify();
}

export function getInstallState(): InstallState {
  return state;
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The user accepted the browser's install dialog (or `appinstalled` fired). */
export function markInstalled(): void {
  setState({ isInstalled: true, deferredPrompt: null });
}

/** The prompt was consumed (dismissed) — drop it so we never re-ask. */
export function clearDeferredPrompt(): void {
  if (state.deferredPrompt) setState({ deferredPrompt: null });
}

if (typeof window !== "undefined") {
  const iosAgent = window.navigator.userAgent.toLowerCase();
  const standaloneQuery = window.matchMedia("(display-mode: standalone)");

  state = {
    ...state,
    isInstalled:
      standaloneQuery.matches ||
      Boolean(
        (window.navigator as typeof window.navigator & { standalone?: boolean })
          .standalone,
      ),
    isIOS: /iphone|ipad|ipod/.test(iosAgent),
  };

  const handleBeforeInstall = (event: Event) => {
    event.preventDefault();
    setState({ deferredPrompt: event as BeforeInstallPromptEvent });
  };

  const handleAppInstalled = () => markInstalled();

  const handleDisplayModeChange = (event: MediaQueryListEvent) =>
    setState({ isInstalled: event.matches });

  window.addEventListener("beforeinstallprompt", handleBeforeInstall);
  window.addEventListener("appinstalled", handleAppInstalled);
  if (typeof standaloneQuery.addEventListener === "function") {
    standaloneQuery.addEventListener("change", handleDisplayModeChange);
  }
}