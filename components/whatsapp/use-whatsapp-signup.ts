"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  completeWhatsappSignupAction,
  getWhatsappSignupConfig,
} from "@/lib/actions/whatsapp";

type SignupPayload = { wabaId: string; phoneNumberId: string };

type FbLoginResponse = { authResponse?: { code?: string } | null };

type FbSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (
    callback: (response: FbLoginResponse) => void,
    options: Record<string, unknown>,
  ) => void;
};

declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";

/** Injects Meta's JS SDK once; resolves when its fbAsyncInit hook fires. */
export function loadFacebookSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve();
    window.fbAsyncInit = () => resolve();
    const script = document.createElement("script");
    script.src = FB_SDK_SRC;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load the Facebook SDK."));
    document.body.appendChild(script);
  });
}

/**
 * Launches Meta's Embedded Signup popup and hands the result (code + asset
 * ids) to the server action, which performs the token exchange server-side.
 * The access token never touches the browser.
 *
 * Shared by Settings → WhatsApp Setup and the AI Agent connection card, so the
 * OAuth wiring lives in exactly one place.
 */
export function useWhatsappSignup() {
  const router = useRouter();
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signupCodeRef = useRef<string | null>(null);
  const payloadRef = useRef<SignupPayload | null>(null);
  const completingRef = useRef(false);
  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (messageHandlerRef.current) {
        window.removeEventListener("message", messageHandlerRef.current);
      }
    };
  }, []);

  /** Fires once both the exchangeable code and the asset ids are present. */
  const tryComplete = useCallback(async (): Promise<boolean> => {
    if (completingRef.current) return false;
    const code = signupCodeRef.current;
    const payload = payloadRef.current;
    if (!code || !payload) return false;
    completingRef.current = true;
    try {
      const res = await completeWhatsappSignupAction(
        code,
        payload.wabaId,
        payload.phoneNumberId,
      );
      if (!res.ok) {
        setError(res.message ?? "WhatsApp connection failed.");
        return false;
      }
      return true;
    } finally {
      completingRef.current = false;
    }
  }, []);

  /**
   * Run the whole Embedded Signup flow. Resolves true when the connection is
   * saved; the caller owns any UX (closing the modal, advancing a step).
   */
  const launchSignup = useCallback(async (): Promise<boolean> => {
    setError(null);
    setLaunching(true);
    signupCodeRef.current = null;
    payloadRef.current = null;

    try {
      const launch = await getWhatsappSignupConfig();
      if (!launch.ok) {
        setError(launch.message);
        return false;
      }
      const { appId, configId, graphVersion } = launch.data;

      await loadFacebookSdk();
      // Business-type apps have no consumer-login permissions, so the SDK's
      // automatic FedCM "Continue as …" prompt dies with "needs at least one
      // supported permission". We only need Embedded Signup (config_id flow,
      // which FedCM doesn't support) — disable the auto-prompt so the SDK
      // falls back to the plain OAuth popup.
      window.FB?.init({
        appId,
        cookie: false,
        xfbml: false,
        version: graphVersion,
        fedCM: { autoPrompt: false },
      });

      // Embedded Signup reports the WABA/phone-number ids via a window
      // message event; the exchangeable code arrives in the login callback.
      const messageHandler = (event: MessageEvent) => {
        try {
          const body =
            typeof event.data === "string"
              ? (JSON.parse(event.data) as Record<string, unknown>)
              : (event.data as Record<string, unknown> | null);
          if (!body || body.type !== "WA_EMBEDDED_SIGNUP") return;
          const raw = body.data as
            | { waba_id?: unknown; phone_number_id?: unknown }
            | undefined;
          if (raw?.waba_id && raw?.phone_number_id) {
            payloadRef.current = {
              wabaId: String(raw.waba_id),
              phoneNumberId: String(raw.phone_number_id),
            };
            void tryComplete();
          }
        } catch {
          // Non-signup messages are expected; ignore parse failures.
        }
      };
      messageHandlerRef.current = messageHandler;
      window.addEventListener("message", messageHandler);

      await new Promise<void>((resolve) => {
        window.FB?.login((response) => {
          signupCodeRef.current = response.authResponse?.code ?? null;
          resolve();
        }, {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {} },
        });
      });

      const ok = await tryComplete();
      if (ok) router.refresh();
      return ok;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start WhatsApp signup.");
      return false;
    } finally {
      setLaunching(false);
    }
  }, [router, tryComplete]);

  return { launching, error, setError, launchSignup };
}