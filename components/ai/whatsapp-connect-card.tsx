"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Link2, Loader2, Phone, Unlink, XCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  completeWhatsappSignupAction,
  disconnectWhatsappAction,
  getWhatsappSignupConfig,
} from "@/lib/actions/whatsapp";

/** Member-readable subset of `clinic_whatsapp_config` (never the token). */
export type WhatsappConfigView = {
  connection_status: "not_connected" | "connected" | "error";
  display_phone_number: string | null;
  whatsapp_business_account_id: string | null;
  status_message: string | null;
};

type SignupPayload = { wabaId: string; phoneNumberId: string };

type FbLoginResponse = { authResponse?: { code?: string } | null };

type FbSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (cb: (response: FbLoginResponse) => void, options: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";

/** Injects Meta's JS SDK once; resolves when its fbAsyncInit hook fires. */
function loadFacebookSdk(): Promise<void> {
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
 * WhatsApp Business connection card (Phase 12). Launches Meta's Embedded
 * Signup popup and hands the result (code + asset ids) to the server action,
 * which performs the token exchange server-side. The access token never
 * touches this component.
 */
export function WhatsappConnectCard({
  config,
  canWrite,
}: {
  config: WhatsappConfigView | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [launching, setLaunching] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signupCodeRef = useRef<string | null>(null);
  const payloadRef = useRef<SignupPayload | null>(null);
  const completingRef = useRef(false);

  const status = config?.connection_status ?? "not_connected";

  /** Fires once both the exchangeable code and the asset ids are present. */
  const tryComplete = useCallback(async () => {
    if (completingRef.current) return;
    const code = signupCodeRef.current;
    const payload = payloadRef.current;
    if (!code || !payload) return;
    completingRef.current = true;
    try {
      const res = await completeWhatsappSignupAction(
        code,
        payload.wabaId,
        payload.phoneNumberId,
      );
      if (!res.ok) setError(res.message ?? "WhatsApp connection failed.");
    } finally {
      completingRef.current = false;
      router.refresh();
    }
  }, [router]);

  async function handleLaunch(): Promise<void> {
    setError(null);
    setLaunching(true);
    signupCodeRef.current = null;
    payloadRef.current = null;

    try {
      const launch = await getWhatsappSignupConfig();
      if (!launch.ok) {
        setError(launch.message);
        return;
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
          const data = body.data as Partial<SignupPayload> & Record<string, unknown> | undefined;
          if (data?.waba_id && data?.phone_number_id) {
            payloadRef.current = {
              wabaId: String(data.waba_id),
              phoneNumberId: String(data.phone_number_id),
            };
            void tryComplete();
          }
        } catch {
          // Non-signup messages are expected; ignore parse failures.
        }
      };
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

      await tryComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start WhatsApp signup.");
    } finally {
      setLaunching(false);
    }
  }

  async function handleDisconnect(): Promise<void> {
    setError(null);
    setDisconnecting(true);
    try {
      const res = await disconnectWhatsappAction();
      if (!res.ok) setError(res.message ?? "Disconnect failed.");
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  const statusBadge =
    status === "connected" ? (
      <Badge variant="success">
        <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" /> Connected
      </Badge>
    ) : status === "error" ? (
      <Badge variant="destructive">
        <XCircle className="mr-1 h-3 w-3" aria-hidden="true" /> Error
      </Badge>
    ) : (
      <Badge variant="outline">Not connected</Badge>
    );

  return (
    <div className="space-y-3 rounded-control border border-text-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {statusBadge}
          {config?.display_phone_number && (
            <span className="inline-flex items-center gap-1 text-sm text-text-secondary">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              {config.display_phone_number}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {launching && <Loader2 className="h-4 w-4 animate-spin text-text-muted" aria-hidden="true" />}
          {status === "connected" ? (
            canWrite && (
              <Button type="button" variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
                <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                Disconnect
              </Button>
            )
          ) : (
            canWrite && (
              <Button type="button" size="sm" onClick={handleLaunch} disabled={launching}>
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                Connect WhatsApp
              </Button>
            )
          )}
        </div>
      </div>

      {status === "error" && config?.status_message && (
        <p className="text-xs text-status-destructive">{config.status_message}</p>
      )}

      {status !== "connected" && !error && (
        <p className="text-xs text-text-muted">
          Connect your WhatsApp Business number through Meta&apos;s official signup flow. Credentials are stored
          server-side only. Messaging goes live in a later phase — this step just links your number.
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <XCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
