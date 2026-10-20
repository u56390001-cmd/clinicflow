"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  ExternalLink,
  Lock,
  Plug,
  Shield,
  Unlink,
  Video,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ZegoConnectionStatus } from "@/types/database";

/**
 * Per-clinic ZEGOcloud connection card. The App ID is public by design — it
 * rides inside every token — while the Server Secret is write-only from the
 * browser: this form sends it to a server action, which stores it in the
 * zero-policy `clinic_zego_secrets` table and never echoes it back.
 */

export type ZegoConfigView = {
  app_id: string | null;
  connection_status: ZegoConnectionStatus;
  connected_at: string | null;
  status_message: string | null;
};

const ZEGO_CONSOLE_URL = "https://console.zegocloud.com/console/app";

export function ZegoSetupWorkspace({
  config,
  canWrite,
}: {
  config: ZegoConfigView | null;
  canWrite: boolean;
}) {
  const status: ZegoConnectionStatus = config?.connection_status ?? "not_connected";
  const isConnected = status === "connected";
  const savedAppId = config?.app_id ?? null;

  const [appId, setAppId] = useState(savedAppId ?? "");
  const [serverSecret, setServerSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [verified, setVerified] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const verify = useCallback(async () => {
    if (!appId.trim() || !serverSecret.trim()) {
      toast.error("Enter both the App ID and the Server Secret to verify.");
      return;
    }
    const { verifyZegoCredentialsAction } = await import(
      "@/lib/actions/zego-settings"
    );
    const result = await verifyZegoCredentialsAction({
      appId: appId.trim(),
      serverSecret: serverSecret.trim(),
    });
    if (result.ok) {
      setVerified(true);
      toast.success("Credentials look valid.", {
        description: result.data.message,
      });
    } else {
      setVerified(false);
      toast.error(result.message);
    }
  }, [appId, serverSecret]);

  const connect = useCallback(async () => {
    if (!appId.trim() || !serverSecret.trim()) {
      toast.error("Enter both the App ID and the Server Secret.");
      return;
    }
    setSaving(true);
    const { saveZegoConnectionAction } = await import(
      "@/lib/actions/zego-settings"
    );
    const result = await saveZegoConnectionAction({
      appId: appId.trim(),
      serverSecret: serverSecret.trim(),
    });
    setSaving(false);
    if (result.ok) {
      setVerified(false);
      setServerSecret("");
      toast.success("Video calling connected for this clinic.");
      window.location.reload();
    } else {
      toast.error(result.message);
    }
  }, [appId, serverSecret]);

  const disconnect = useCallback(async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    const { disconnectZegoAction } = await import(
      "@/lib/actions/zego-settings"
    );
    const result = await disconnectZegoAction();
    setIsDisconnecting(false);
    if (result.ok) {
      toast.success("Disconnected. Calls fall back to the platform defaults.");
      window.location.reload();
    } else {
      toast.error(result.message);
    }
  }, [isDisconnecting]);

  return (
    <div className="w-full space-y-6">
      {!isConnected ? null : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Connection state */}
          <section className="rounded-card border border-hairline bg-surface p-4 md:p-6">
            <div className="flex items-start gap-4">
              <span
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-pill",
                  isConnected
                    ? "bg-status-success/15 text-status-success"
                    : status === "error"
                      ? "bg-status-destructive/15 text-status-destructive"
                      : "bg-status-warning/15 text-status-warning",
                )}
              >
                {isConnected ? (
                  <CheckCircle2 className="size-7" aria-hidden="true" />
                ) : status === "error" ? (
                  <CircleAlert className="size-7" aria-hidden="true" />
                ) : (
                  <Video className="size-7" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-text-primary">
                  {isConnected
                    ? "Video calling connected"
                    : status === "error"
                      ? "Connection error"
                      : "Video calling not connected"}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  {isConnected
                    ? savedAppId
                      ? `Project App ID ${savedAppId} · connected ${formatted(config?.connected_at)}`
                      : "Credentials saved."
                    : status === "error"
                      ? (config?.status_message ??
                        "Something went wrong — reconnect below.")
                      : "Connect your own ZEGOcloud project so every consultation runs on your account. Until then the platform defaults are used."}
                </p>
              </div>
            </div>

            {canWrite && isConnected && (
              <div className="mt-4 flex justify-end border-t-[0.5px] border-hairline pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isDisconnecting}
                  onClick={() => void disconnect()}
                >
                  <Unlink className="size-3.5" />
                  Disconnect project
                </Button>
              </div>
            )}
          </section>

          {/* Credential form */}
          {canWrite && (
            <section className="mt-6 rounded-card border border-hairline bg-surface p-4 md:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-text-primary">
                  {isConnected ? "Replace project" : "Connect ZEGOcloud"}
                </h3>
                <a
                  href={ZEGO_CONSOLE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline"
                >
                  Zego console
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="text-ink text-[12.5px] font-semibold">
                    App ID
                  </span>
                  <input
                    value={appId}
                    onChange={(event) => setAppId(event.target.value)}
                    placeholder="ZEGOcloud App ID (numbers only)"
                    inputMode="numeric"
                    autoComplete="off"
                    className="text-ink mt-1 h-10 w-full rounded-control border-[0.5px] border-hairline bg-app px-3 text-[13px] placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-ink flex items-center gap-1.5 text-[12.5px] font-semibold">
                    <Lock className="size-3" aria-hidden="true" />
                    Server Secret
                  </span>
                  <input
                    value={serverSecret}
                    onChange={(event) => {
                      setServerSecret(event.target.value);
                      setVerified(false);
                    }}
                    placeholder="16, 24 or 32 characters"
                    type="password"
                    autoComplete="new-password"
                    className="text-ink mt-1 h-10 w-full rounded-control border-[0.5px] border-hairline bg-app px-3 text-[13px] placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                  />
                  <span className="mt-1 block text-[11.5px] text-text-muted">
                    Stored in a write-only secrets table and used to sign call
                    tokens on the server — it is never shown back here.
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void verify()}
                    disabled={saving}
                  >
                    <Shield className="size-3.5" />
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void connect()}
                    disabled={saving}
                  >
                    <Plug className="size-3.5" />
                    {isConnected ? "Replace & connect" : "Connect"}
                  </Button>
                  {verified && (
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-status-success">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      Format OK
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Help column */}
        <aside className="space-y-4">
          <section className="rounded-card border border-hairline bg-app p-4">
            <div className="flex items-center gap-2">
              <CircleHelp className="size-4 text-primary" aria-hidden="true" />
              <h4 className="text-[13.5px] font-semibold text-ink">
                Where are my credentials?
              </h4>
            </div>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[12.5px] leading-relaxed text-text-secondary">
              <li>
                Create (or open) a project in the ZEGOcloud console and pick
                the Express Video product.
              </li>
              <li>
                Copy the <strong className="text-ink">App ID</strong> from the
                project overview.
              </li>
              <li>
                Under <em>Server-Side</em> (or Project Collaboration), copy the{" "}
                <strong className="text-ink">Server Secret</strong>.
              </li>
              <li>Paste both here and press Connect.</li>
            </ol>
          </section>

          <section className="rounded-card border border-hairline bg-app p-4">
            <h4 className="text-[13.5px] font-semibold text-ink">
              What your project gives you
            </h4>
            <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-text-secondary">
              <li>• Calls billed and hosted entirely in your account</li>
              <li>• Your own usage dashboard and quotas</li>
              <li>
                • Doctor &amp; patient rooms isolated per clinic, with tokens
                signed by your secret
              </li>
            </ul>
            {!isConnected && (
              <p className="mt-3 rounded-control bg-status-info/10 px-3 py-2 text-[11.5px] leading-relaxed text-status-info">
                Until a project is connected, video calls keep working through
                the platform defaults.
              </p>
            )}
          </section>
        </aside>
      </div>

      {!canWrite && (
        <p className="text-[12px] text-text-muted">
          You can view this connection, but only owners and admins can change
          it.
        </p>
      )}
    </div>
  );
}

function formatted(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
