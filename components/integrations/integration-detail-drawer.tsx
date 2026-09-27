"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  Info,
  KeyRound,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";

import { IntegrationIcon } from "@/components/integrations/integration-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type {
  IntegrationCatalogEntry,
  IntegrationField,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Integration detail drawer — slides in from the right.
 *
 * ## Why a drawer and not the previous centred modal
 *
 * The card grid is a scanning surface: a clinic opens it to compare what is
 * available. A centred modal covers the grid, so reading two integrations means
 * close, open, read, close, open. The drawer leaves the grid visible on wide
 * screens, which is what makes the catalogue comparable at all.
 *
 * ## Structure mirrors what a clinic is actually deciding
 *
 * What it is → what changes if I turn it on → what am I about to grant →
 * connect. The permissions block sits directly above the connect button on
 * purpose: it is the last place the grant is legible before consent, and an
 * unexplained consent screen is how people agree to things they did not mean to.
 *
 * ## Credentials stay write-only
 *
 * A `secret: true` field renders empty even when a value is saved, with an
 * "already saved" hint. The value was never sent to the browser, so there is
 * nothing to prefill — and prefilling it would put the clinic's Zoom client
 * secret in the DOM. Blank means "keep what is saved"; clearing is the separate,
 * explicit Disconnect action, so a stray backspace cannot revoke a working
 * integration.
 */
export function IntegrationDetailDrawer({
  entry,
  status,
  hasCredentials,
  config,
  canManage,
  saving,
  error,
  onClose,
  onSave,
  onToggle,
  onDisconnect,
}: {
  entry: IntegrationCatalogEntry;
  status: "activated" | "disabled" | "error";
  hasCredentials: boolean;
  config: Record<string, unknown>;
  canManage: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: {
    config: Record<string, string>;
    credentials: Record<string, string>;
  }) => void;
  onToggle: (next: boolean) => void;
  onDisconnect: () => void;
}) {
  // Non-secret values prefill from the member-readable config column. Secrets
  // deliberately start empty — see the note above.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of entry.fields) {
      if (field.secret) continue;
      const existing = config[field.name];
      initial[field.name] = typeof existing === "string" ? existing : "";
    }
    return initial;
  });
  const [secrets, setSecrets] = useState<Record<string, string>>({});

  // Reset when the drawer is pointed at a different integration, so a previous
  // vendor's half-typed key cannot appear under the next one.
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const field of entry.fields) {
      if (field.secret) continue;
      const existing = config[field.name];
      initial[field.name] = typeof existing === "string" ? existing : "";
    }
    setValues(initial);
    setSecrets({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Prevent the page behind from scrolling while the drawer is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  function handleSave() {
    const nextConfig: Record<string, string> = {};
    const nextCredentials: Record<string, string> = {};
    for (const field of entry.fields) {
      const raw = field.secret ? secrets[field.name] : values[field.name];
      if (raw === undefined) continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (field.secret) nextCredentials[field.name] = trimmed;
      else nextConfig[field.name] = trimmed;
    }
    onSave({ config: nextConfig, credentials: nextCredentials });
  }

  const connected = status === "activated" || hasCredentials;

  /**
   * A required field is satisfied by a typed value, OR — for a secret — by a
   * credential already on file. Blank on a secret means "keep what is saved"
   * (see the note at the top), so without that second clause a clinic that had
   * connected, came back to change only the calendar name, and pressed Save
   * would be blocked by an empty box that is not actually empty.
   */
  const missingRequired = entry.fields.some((f) => {
    if (!f.required) return false;
    const typed = (f.secret ? secrets[f.name] : values[f.name]) ?? "";
    if (typed.trim()) return false;
    return !(f.secret && hasCredentials);
  });

  const isClinicSetting = entry.backedBy === "clinic_setting";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop. Kept separate from the panel so the panel's slide animation
          is not restarted by a re-render of this parent. */}
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 animate-backdrop-in bg-black/45"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="integration-drawer-title"
        className="relative flex h-full w-full max-w-md animate-drawer-in flex-col border-l border-text-muted/30 bg-surface shadow-2xl"
      >
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                          */}
        {/* ---------------------------------------------------------------- */}
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-text-muted/20 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <IntegrationIcon integrationKey={entry.key} />
            <div className="min-w-0">
              <h2
                id="integration-drawer-title"
                className="truncate text-base font-bold text-text-primary"
              >
                {entry.name}
              </h2>
              <div className="mt-0.5 flex items-center gap-2">
                {entry.host && (
                  <a
                    href={`https://${entry.host}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-0.5 truncate text-xs text-text-muted hover:text-primary hover:underline"
                  >
                    {entry.host}
                    <ExternalLink
                      className="size-2.5 shrink-0"
                      aria-hidden="true"
                    />
                  </a>
                )}
                <span
                  className={cn(
                    "shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-semibold",
                    connected
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-app text-text-muted",
                  )}
                >
                  {connected ? "Connected" : "Not Connected"}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1 text-text-muted transition-colors hover:bg-app hover:text-text-primary"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        {/* ---------------------------------------------------------------- */}
        {/* Body                                                            */}
        {/* ---------------------------------------------------------------- */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {/* Details */}
          <Section title="Details">
            <p className="text-sm leading-relaxed text-text-secondary">
              {entry.description}
            </p>
          </Section>

          {/* What you get */}
          {entry.highlights.length > 0 && (
            <Section title="What you get">
              <ul className="space-y-2">
                {entry.highlights.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-text-secondary">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-status-success"
                      aria-hidden="true"
                    />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Permissions required */}
          {entry.permissions.length > 0 && (
            <Section title="Permissions required">
              <ul className="space-y-2">
                {entry.permissions.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2.5 text-sm text-text-secondary"
                  >
                    <KeyRound
                      className="mt-0.5 size-4 shrink-0 text-text-muted"
                      aria-hidden="true"
                    />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Vendor-pending notice. Stated plainly rather than hidden, because
              "Connected" on a card whose vendor step is unfinished would be a
              claim the backend cannot honour. */}
          {entry.needsVendorSetup && entry.vendorNote && (
            <div className="rounded-control border border-amber-200 bg-amber-50 p-3">
              <div className="flex gap-2.5">
                <Info
                  className="mt-0.5 size-4 shrink-0 text-amber-700"
                  aria-hidden="true"
                />
                <p className="text-xs leading-relaxed text-amber-900">
                  {entry.vendorNote}
                </p>
              </div>
              {entry.manageHref && (
                <Button asChild size="sm" variant="outline" className="mt-2.5 w-full bg-white">
                  <a href={entry.manageHref}>
                    Open the page that owns this setup
                    <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
              )}
            </div>
          )}

          {/* Configuration form. Hidden for entries that complete elsewhere. */}
          {!entry.connectHref && entry.fields.length > 0 && (
            <Section title={isClinicSetting ? "Options" : "Configuration"}>
              <div className="space-y-4">
                {entry.fields.map((field) => (
                  <Field
                    key={field.name}
                    field={field}
                    value={
                      field.secret
                        ? (secrets[field.name] ?? "")
                        : (values[field.name] ?? "")
                    }
                    saved={
                      field.secret
                        ? hasCredentials
                        : Boolean(config[field.name])
                    }
                    disabled={!canManage || saving}
                    onChange={(next) => {
                      if (field.secret) {
                        setSecrets((prev) => ({ ...prev, [field.name]: next }));
                      } else {
                        setValues((prev) => ({ ...prev, [field.name]: next }));
                      }
                    }}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* On/off. Separate from saving, so a green "Connected" always means
              somebody chose it rather than that a form was submitted. */}
          {!entry.connectHref && !isClinicSetting && (
            <div className="flex items-center justify-between gap-3 rounded-control border border-text-muted/30 bg-app/50 p-3">
              <div className="pr-3">
                <p className="text-sm font-medium text-text-primary">
                  Turn {entry.name} on
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {status === "activated"
                    ? "Currently on."
                    : "Save your settings first, then switch this on."}
                </p>
              </div>
              <Switch
                checked={status === "activated"}
                disabled={!canManage || saving}
                onCheckedChange={onToggle}
                aria-label={`Turn ${entry.name} on`}
              />
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-control border border-status-destructive/30 bg-red-50 p-2.5 text-xs text-red-700"
            >
              <TriangleAlert
                className="mt-0.5 size-3.5 shrink-0"
                aria-hidden="true"
              />
              {error}
            </p>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Footer — the connect action                                     */}
        {/* ---------------------------------------------------------------- */}
        <footer className="shrink-0 space-y-2 border-t border-text-muted/20 bg-app/40 p-4">
          {entry.connectHref ? (
            <Button asChild className="w-full">
              <a href={entry.connectHref}>
                {entry.connectLabel ?? `Connect ${entry.name}`}
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
          ) : isClinicSetting ? (
            <Button
              className="w-full"
              onClick={onClose}
              disabled={!canManage || saving}
            >
              Done
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              {hasCredentials && (
                <Button
                  variant="ghost"
                  onClick={onDisconnect}
                  disabled={!canManage || saving}
                  className="text-status-destructive hover:bg-red-50"
                >
                  Disconnect
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={!canManage || saving || missingRequired}
                className="ml-auto"
              >
                {saving && <Spinner className="size-4" aria-hidden="true" />}
                {hasCredentials ? "Save settings" : "Connect"}
              </Button>
            </div>
          )}

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
            <ShieldCheck className="size-3" aria-hidden="true" />
            {hasCredentials
              ? "Credentials are stored server-side"
              : "Credentials are encrypted and never shown again"}
          </p>
        </footer>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  field,
  value,
  saved,
  disabled,
  onChange,
}: {
  field: IntegrationField;
  value: string;
  saved: boolean;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const id = `integration-field-${field.name}`;
  const showSavedHint = field.secret && saved;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-semibold text-text-primary"
      >
        {field.label}
        {field.required && (
          <span className="ml-0.5 text-status-destructive">*</span>
        )}
      </label>

      {field.kind === "select" ? (
        <NativeSelect
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {!field.required && <option value="">Not set</option>}
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <Input
          id={id}
          type={field.kind === "password" ? "password" : "text"}
          value={value}
          disabled={disabled}
          placeholder={field.placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {showSavedHint ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-status-success">
          <ShieldCheck className="size-3" aria-hidden="true" />
          A value is saved. Leave blank to keep it.
        </p>
      ) : field.help ? (
        <p className="mt-1 text-xs text-text-muted">{field.help}</p>
      ) : null}
    </div>
  );
}
