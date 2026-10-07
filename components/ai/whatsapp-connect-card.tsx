"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Link2, Loader2, Phone, Unlink, XCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWhatsappSignup } from "@/components/whatsapp/use-whatsapp-signup";
import { disconnectWhatsappAction } from "@/lib/actions/whatsapp";

/** Member-readable subset of `clinic_whatsapp_config` (never the token). */
export type WhatsappConfigView = {
  connection_status: "not_connected" | "connected" | "error";
  display_phone_number: string | null;
  whatsapp_business_account_id: string | null;
  status_message: string | null;
};

/**
 * WhatsApp Business connection card (Phase 12). Launches Meta's Embedded
 * Signup popup and hands the result (code + asset ids) to the server action,
 * which performs the token exchange server-side. The access token never
 * touches this component. Shares the OAuth wiring (and the SDK popup lifecycle)
 * with Settings → WhatsApp Setup via `useWhatsappSignup`.
 */
export function WhatsappConnectCard({
  config,
  canWrite,
}: {
  config: WhatsappConfigView | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { launching, error, setError, launchSignup } = useWhatsappSignup();
  const [disconnecting, setDisconnecting] = useState(false);

  const status = config?.connection_status ?? "not_connected";

  async function handleLaunch(): Promise<void> {
    await launchSignup();
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
