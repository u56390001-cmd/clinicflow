"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  ExternalLink,
  Info,
  MessageSquare,
  Phone,
  Shield,
  Unlink,
  Zap,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { WhatsappConnectionStatus } from "@/types/database";
import { BeforeConnectModal } from "@/components/whatsapp/before-connect-modal";
import { useWhatsappSignup } from "@/components/whatsapp/use-whatsapp-signup";

/** Member-readable subset of `clinic_whatsapp_config` (never the token). */
export type WhatsappConfigView = {
  connection_status: WhatsappConnectionStatus;
  display_phone_number: string | null;
  whatsapp_business_account_id: string | null;
  status_message: string | null;
};

const SETUP_GUIDE_URL = "https://business.whatsapp.com/products/business-platform";

const STEP_LABELS = ["Connect", "Select Number", "Booking QR"] as const;

const FEATURES = [
  "Automated appointment reminders",
  "AI-powered patient responses",
  "Automated review requests",
  "Smart patient filtering",
] as const;

const REQUIREMENTS = [
  "Verified WhatsApp Business Account",
  "Meta Business Manager access",
  "Admin permissions for API",
] as const;

export function WhatsappSetupWorkspace({
  config,
  canWrite,
}: {
  config: WhatsappConfigView | null;
  canWrite: boolean;
}) {
  const { launching, error, setError, launchSignup } = useWhatsappSignup();
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTimer, setToastTimer] = useState<number | null>(null);

  const status = config?.connection_status ?? "not_connected";
  const isConnected = status === "connected";
  const isError = status === "error";
  const displayNumber = config?.display_phone_number ?? null;

  const flash = useCallback(
    (message: string) => {
      setToast(message);
      if (toastTimer) window.clearTimeout(toastTimer);
      setToastTimer(
        window.setTimeout(() => setToast(null), 4000),
      );
    },
    [toastTimer],
  );

  const handleContinue = useCallback(async () => {
    const ok = await launchSignup();
    setModalOpen(false);
    if (ok) flash("WhatsApp connected — your number is ready");
  }, [flash, launchSignup]);

  const handleDisconnect = useCallback(async () => {
    setError(null);
    const { disconnectWhatsappAction } = await import(
      "@/lib/actions/whatsapp"
    );
    const res = await disconnectWhatsappAction();
    if (res.ok) {
      flash("WhatsApp disconnected");
      window.location.reload();
    } else {
      setError(res.message ?? "Disconnect failed.");
    }
  }, [flash, setError]);

  const activeIndex = isConnected ? 1 : 0;

  return (
    <div className="w-full">
      {/* ── Top warning banner ── */}
      {!isConnected ? (
        <div className="mb-6 rounded-card border-2 border-status-warning/30 bg-status-warning/10 p-4 md:mb-8 md:p-6">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-status-warning/15 text-status-warning">
              <CircleAlert className="size-7" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-status-warning md:text-lg">
                WhatsApp Not Connected
              </h3>
              <p className="mt-1 text-sm text-status-warning/80">
                Your automated reminders and AI assistant features are currently
                disabled. Complete the setup below to activate.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* ── Left column: setup wizard ── */}
        <div className="lg:col-span-2">
          <section className="mb-6 rounded-card border border-hairline bg-surface p-4 md:p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-primary">
                Setup Progress
              </h3>
              <span className="text-sm text-text-secondary">
                {isConnected ? "Step 2 of 3" : "Step 1 of 3"}
              </span>
            </div>

            {/* Stepper */}
            <div className="mb-8 flex items-center justify-between pb-0">
              {STEP_LABELS.map((label, index) => {
                const done = index < activeIndex;
                const active = index === activeIndex;
                const connector = index < STEP_LABELS.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mx-1 h-1 flex-1 rounded-pill md:mx-4",
                      index < activeIndex ? "bg-primary/50" : "bg-skeleton",
                    )}
                  />
                ) : null;

                return (
                  <div key={label} className="flex min-w-0 flex-1 items-center">
                    <div className="flex flex-col items-center gap-2">
                      <span
                        className={cn(
                          "flex size-9 items-center justify-center rounded-pill font-semibold transition-all md:size-12",
                          active || done
                            ? "bg-primary text-white"
                            : "bg-skeleton text-text-muted",
                        )}
                      >
                        {done ? (
                          <Check className="size-5" aria-hidden="true" />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span
                        className={cn(
                          "max-w-[44px] text-center text-xs font-medium leading-tight md:max-w-[56px]",
                          active || done
                            ? "text-text-primary"
                            : "text-text-muted",
                        )}
                      >
                        {label}
                      </span>
                    </div>
                    {connector}
                  </div>
                );
              })}
            </div>

            {/* Step 1 — Connect WhatsApp Business */}
            <div className="flex flex-col gap-4">
              <div
                className={cn(
                  "rounded-card border-2 p-6 transition-all",
                  isConnected
                    ? "border-hairline bg-surface"
                    : "border-primary/40 bg-surface",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-pill text-xs font-bold text-white",
                      isConnected ? "bg-primary" : "bg-primary",
                    )}
                  >
                    {isConnected ? (
                      <Check className="size-3.5" aria-hidden="true" />
                    ) : (
                      "1"
                    )}
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-[15px] font-semibold text-text-primary">
                      Connect WhatsApp Business Account
                    </h4>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {isConnected
                        ? "Linked via Meta&apos;s official signup"
                        : "Login with your Meta account and authorize access"}
                    </p>
                  </div>
                </div>

                <div className="ml-8 mt-4">
                  {!isConnected && canWrite ? (
                    <>
                      <div className="relative w-full md:inline-block">
                        <Button
                          type="button"
                          onClick={() => setModalOpen(true)}
                          className="w-full transition-all hover:scale-[1.02] active:scale-[0.98] md:w-auto"
                        >
                          <MessageSquare aria-hidden="true" />
                          <span className="md:hidden">Connect</span>
                          <span className="hidden md:inline">
                            Connect WhatsApp Business
                          </span>
                          <Info
                            className="hidden text-white/70 md:inline"
                            aria-hidden="true"
                          />
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-text-muted">
                        You&apos;ll be redirected to Meta for authentication
                      </p>
                      <p className="mt-1 text-xs font-medium text-primary">
                        Tip: Select your{" "}
                        <strong>existing WhatsApp number</strong> (not &quot;Create
                        new&quot;) to keep App + API both active
                      </p>
                    </>
                  ) : null}

                  {!isConnected && !canWrite ? (
                    <p className="text-sm text-text-muted">
                      Only owners and admins can connect WhatsApp. Ask an owner
                      or admin to complete the setup.
                    </p>
                  ) : null}

                  {isConnected && config ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-status-success">
                        <CheckCircle2
                          className="size-4"
                          aria-hidden="true"
                        />
                        Connected
                        {displayNumber ? ` · ${displayNumber}` : ""}
                      </span>
                      {canWrite ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleDisconnect}
                        >
                          <Unlink className="size-3.5" aria-hidden="true" />
                          Disconnect
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {error ? (
                    <Alert variant="destructive" className="mt-3">
                      <CircleAlert aria-hidden="true" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  ) : null}

                  {isError && config?.status_message ? (
                    <p className="mt-2 text-xs text-status-destructive">
                      {config.status_message}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Step 2 — Select Phone Number */}
              <div
                className={cn(
                  "rounded-card border-2 p-6 transition-all",
                  !isConnected && "pointer-events-none opacity-50",
                  isConnected
                    ? "border-primary/40 bg-surface"
                    : "border-hairline bg-app",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-pill text-xs font-bold",
                      isConnected
                        ? "bg-primary text-white"
                        : "bg-skeleton text-text-muted",
                    )}
                  >
                    2
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-[15px] font-semibold text-text-primary">
                      Select Phone Number
                    </h4>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {isConnected && displayNumber
                        ? `${displayNumber} is linked to this clinic`
                        : "Choose your WhatsApp Business number"}
                    </p>
                  </div>
                </div>

                {isConnected ? (
                  <div className="ml-8 mt-4">
                    <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
                      <Phone className="size-4 text-primary" aria-hidden="true" />
                      {displayNumber ?? "Number connected"}
                    </span>
                    <p className="mt-1 text-xs text-text-muted">
                      Chosen during Meta&apos;s signup — only numbers on the
                      connected WhatsApp Business account can be linked.
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Step 3 — Booking QR */}
              <div
                className={cn(
                  "rounded-card border-2 p-6 transition-all",
                  !isConnected && "pointer-events-none opacity-50",
                  isConnected
                    ? "border-primary/40 bg-surface"
                    : "border-hairline bg-app",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-pill text-xs font-bold",
                      isConnected
                        ? "bg-primary text-white"
                        : "bg-skeleton text-text-muted",
                    )}
                  >
                    3
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-[15px] font-semibold text-text-primary">
                      Booking QR
                    </h4>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {isConnected
                        ? "Share a QR code so patients can start a WhatsApp conversation"
                        : "Becomes available after your number is connected"}
                    </p>
                  </div>
                </div>

                {isConnected ? (
                  <div className="ml-8 mt-4">
                    <Button asChild size="sm">
                      <Link href={APP_ROUTES.app.bookingPage}>
                        View booking QR
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        {/* ── Right column: info cards ── */}
        <aside className="flex flex-col gap-6 lg:col-span-1">
          <section className="rounded-card border border-primary/15 bg-primary/10 p-6">
            <h4 className="mb-3 text-base font-semibold text-text-primary">
              Features Enabled
            </h4>
            <ul className="flex flex-col gap-3 text-sm">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Zap
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span className="text-text-secondary">{feature}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-card border border-hairline bg-surface p-4 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-control bg-primary/10 text-primary">
                <CircleHelp className="size-5" aria-hidden="true" />
              </span>
              <h4 className="text-base font-semibold text-text-primary">
                Requirements
              </h4>
            </div>
            <ul className="flex flex-col gap-3 text-sm text-text-secondary">
              {REQUIREMENTS.map((requirement) => (
                <li key={requirement} className="flex items-start gap-2">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>{requirement}</span>
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-4 w-full">
              <a
                href={SETUP_GUIDE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Setup Guide
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
          </section>

          <section className="rounded-card border border-hairline bg-surface p-6">
            <div className="mb-3 flex items-center gap-2">
              <Shield className="size-5 text-primary" aria-hidden="true" />
              <h4 className="text-base font-semibold text-text-primary">
                Secure &amp; Private
              </h4>
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              All credentials are encrypted and follow Meta&apos;s security
              standards. Your data never leaves your control.
            </p>
          </section>
        </aside>
      </div>

      <BeforeConnectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        busy={launching}
        onContinue={handleContinue}
      />

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-card bg-slate-900 px-3.5 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          <Check className="size-4 text-emerald-400" aria-hidden="true" />
          {toast}
        </div>
      ) : null}
    </div>
  );
}