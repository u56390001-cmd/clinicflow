"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Link2, Loader2, Phone, Unlink, XCircle, KeyRound, ChevronDown, ChevronUp } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWhatsappSignup } from "@/components/whatsapp/use-whatsapp-signup";
import {
  connectWhatsappManualAction,
  disconnectWhatsappAction,
} from "@/lib/actions/whatsapp";

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
  // Manual credential paste (dev/test path) — see connectWhatsappManualAction.
  const [showManual, setShowManual] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({
    phoneNumberId: "",
    accessToken: "",
    wabaId: "",
    displayPhone: "",
  });

  const status = config?.connection_status ?? "not_connected";

  async function handleLaunch(): Promise<void> {
    await launchSignup();
  }

  async function saveManualCredentials(): Promise<void> {
    setManualError(null);
    if (!manualForm.phoneNumberId.trim() || !manualForm.accessToken.trim()) {
      setManualError("Phone Number ID and access token are required.");
      return;
    }
    setSavingManual(true);
    try {
      const res = await connectWhatsappManualAction(
        manualForm.phoneNumberId,
        manualForm.accessToken,
        manualForm.wabaId,
        manualForm.displayPhone,
      );
      if (!res.ok) {
        setManualError(res.message ?? "Could not save credentials.");
      } else {
        setShowManual(false);
        router.refresh();
      }
    } finally {
      setSavingManual(false);
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

      {status !== "connected" && canWrite && (
        <div className="border-t border-hairline pt-3">
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="flex w-full items-center justify-between text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              Manual token setup (dev/test) — paste Meta test credentials
            </span>
            {showManual ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          {showManual && (
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="manual-phone-number-id" className="text-xs font-medium text-text-secondary">
                  Phone Number ID <span className="text-status-destructive">*</span>
                </label>
                <input
                  id="manual-phone-number-id"
                  type="text"
                  value={manualForm.phoneNumberId}
                  onChange={(e) => setManualForm((f) => ({ ...f, phoneNumberId: e.target.value }))}
                  placeholder="e.g. 1341982005656272"
                  autoComplete="off"
                  className="w-full rounded-control border border-text-muted/40 bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted hover:border-text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="manual-access-token" className="text-xs font-medium text-text-secondary">
                  Access token <span className="text-status-destructive">*</span>
                </label>
                <input
                  id="manual-access-token"
                  type="password"
                  value={manualForm.accessToken}
                  onChange={(e) => setManualForm((f) => ({ ...f, accessToken: e.target.value }))}
                  placeholder="EAAPJejX9pU8B..."
                  autoComplete="off"
                  className="w-full rounded-control border border-text-muted/40 bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted hover:border-text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="manual-waba-id" className="text-xs font-medium text-text-secondary">
                    WhatsApp Business Account ID (optional)
                  </label>
                  <input
                    id="manual-waba-id"
                    type="text"
                    value={manualForm.wabaId}
                    onChange={(e) => setManualForm((f) => ({ ...f, wabaId: e.target.value }))}
                    placeholder="e.g. 2475719809619689"
                    autoComplete="off"
                    className="w-full rounded-control border border-text-muted/40 bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted hover:border-text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="manual-display-phone" className="text-xs font-medium text-text-secondary">
                    Display phone (optional)
                  </label>
                  <input
                    id="manual-display-phone"
                    type="text"
                    value={manualForm.displayPhone}
                    onChange={(e) => setManualForm((f) => ({ ...f, displayPhone: e.target.value }))}
                    placeholder="+1 (555) 628-6333"
                    autoComplete="off"
                    className="w-full rounded-control border border-text-muted/40 bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted hover:border-text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  />
                </div>
              </div>

              {manualError && (
                <Alert variant="destructive">
                  <XCircle aria-hidden="true" />
                  <AlertDescription>{manualError}</AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowManual(false);
                    setManualError(null);
                  }}
                  disabled={savingManual}
                >
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={saveManualCredentials} disabled={savingManual}>
                  {savingManual && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  Save credentials
                </Button>
              </div>
              <p className="text-[11px] text-text-muted">
                Paste the Phone Number ID and temporary token from Meta → WhatsApp → API Setup. The token is
                stored in the server-only secrets table and never shown again.
              </p>
            </div>
          )}
        </div>
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
