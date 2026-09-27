"use client";

import { useEffect, useState } from "react";
import { Info, ShieldCheck, TriangleAlert, X } from "lucide-react";

import { IntegrationIcon } from "@/components/integrations/integration-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { IntegrationField, IntegrationCatalogEntry } from "@/lib/constants";

/**
 * Configure-integration modal.
 *
 * ## Credentials are write-only
 *
 * A `secret: true` field renders **empty** even when a credential is saved,
 * with a "already saved" hint underneath. The value was never sent to the
 * browser, so there is nothing to prefill — and prefilling it would mean
 * shipping the clinic's Zoom client secret into the DOM where any XSS, any
 * extension, and any curious staff member could read it.
 *
 * Leaving a secret field blank therefore means "keep what is saved", not
 * "clear it". Clearing is a separate, explicit action (Disconnect) because a
 * stray backspace should not revoke a working integration.
 *
 * ## Saving does not turn the integration on
 *
 * The mockup flipped a card to "Active" the instant a clinic pressed Save.
 * Here the switch is separate and explicit, so a green "On" badge always means
 * somebody chose it rather than that a form was submitted.
 */
export function IntegrationConfigModal({
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

  // Reset when the modal is pointed at a different integration, so a previous
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
    return () => window.removeEventListener("keydown", onKey);
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="integration-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-card border border-text-muted/30 bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <IntegrationIcon integrationKey={entry.key} />
            <div>
              <h2
                id="integration-modal-title"
                className="text-base font-bold text-text-primary"
              >
                Configure {entry.name}
              </h2>
              {entry.host && (
                <p className="text-xs text-text-muted">{entry.host}</p>
              )}
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
        </div>

        <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {entry.needsVendorSetup && entry.vendorNote && (
            <div className="flex gap-2.5 rounded-control border border-amber-200 bg-amber-50 p-3">
              <Info
                className="mt-0.5 size-4 shrink-0 text-amber-700"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-amber-900">
                {entry.vendorNote}
              </p>
            </div>
          )}

          {entry.fields.length === 0 && (
            <p className="text-sm text-text-secondary">
              This integration has nothing to configure.
            </p>
          )}

          {entry.fields.map((field) => (
            <Field
              key={field.name}
              field={field}
              value={field.secret ? (secrets[field.name] ?? "") : (values[field.name] ?? "")}
              saved={field.secret ? hasCredentials : Boolean(config[field.name])}
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

          <div className="flex items-center justify-between rounded-control border border-text-muted/30 bg-app/50 p-3">
            <div className="pr-3">
              <p className="text-sm font-medium text-text-primary">
                Turn {entry.name} on
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {status === "activated"
                  ? "Currently on. Nothing is sent to the vendor until its authorisation step is complete."
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

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-control border border-status-destructive/30 bg-red-50 p-2.5 text-xs text-red-700"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          {hasCredentials ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDisconnect}
              disabled={!canManage || saving}
              className="text-status-destructive hover:bg-red-50"
            >
              Disconnect
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Credentials are stored server-side
            </span>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canManage || saving}>
              {saving && <Spinner className="size-4" aria-hidden="true" />}
              Save settings
            </Button>
          </div>
        </div>
      </div>
    </div>
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
