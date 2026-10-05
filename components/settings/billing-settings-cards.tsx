"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Percent,
  Save,
} from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateBillingSettingsAction } from "@/lib/actions/settings";
import { BILL_TERMS_MAX_WORDS, countWords } from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";

/** Tinted icon chip, matching the reference's `rgb(238,240,251)` panel. */
function IconChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-control bg-primary/10">
      {children}
    </span>
  );
}

/** Card heading: tinted icon chip plus title and subtitle, on a hairline rule. */
function CardHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <CardHeader className="flex-row items-center gap-3 space-y-0 border-b border-hairline">
      <IconChip>{icon}</IconChip>
      <div>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="mt-0.5">{subtitle}</CardDescription>
      </div>
    </CardHeader>
  );
}

/** Label + helper + optional monospace preview, with the control on the right. */
function FieldRow({
  label,
  hint,
  preview,
  children,
}: {
  label: string;
  hint: string;
  preview?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="mt-0.5 text-xs text-text-muted">{hint}</p>
        {preview && (
          <p className="mt-1.5 font-mono text-xs text-primary">{preview}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

/** Switch row: label + hint on the left, `Switch` on the right. */
function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="mt-0.5 text-xs text-text-muted">{hint}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}

/** Inline field error, matching the prefix field's treatment on Patient ID. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="-mt-3 flex items-start gap-1 text-xs font-medium text-status-destructive"
    >
      <AlertCircle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export function BillingSettingsCards({
  initial,
  previews,
  canWrite,
}: {
  initial: {
    billNumberPrefix: string;
    receiptPrefix: string;
    autoSendWhatsappReceipt: boolean;
    receiptFooterMessage: string;
    showGstOnReceipt: boolean;
    gstNumber: string;
    gstRate: string;
    billTerms: string;
  };
  /** Next bill / receipt code per prefix, keyed by prefix value. */
  previews: { bill: string; receipt: string };
  canWrite: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateBillingSettingsAction,
    null,
  );

  const [billPrefix, setBillPrefix] = useState(initial.billNumberPrefix);
  const [receiptPrefix, setReceiptPrefix] = useState(initial.receiptPrefix);
  const [autoSend, setAutoSend] = useState(initial.autoSendWhatsappReceipt);
  const [footer, setFooter] = useState(initial.receiptFooterMessage);
  const [showGst, setShowGst] = useState(initial.showGstOnReceipt);
  const [gstNumber, setGstNumber] = useState(initial.gstNumber);
  const [gstRate, setGstRate] = useState(initial.gstRate);
  const [terms, setTerms] = useState(initial.billTerms);

  const submitted = state !== null;
  const errors =
    submitted && state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const words = countWords(terms);
  const overLimit = words > BILL_TERMS_MAX_WORDS;

  // SGST/CGST split is the reference's helper line under the rate field: the
  // stored value is the total, split evenly. Reuses the saved preview while the
  // prefix is untouched, and re-labels locally once it is edited — the same
  // rule the Patient ID card uses, so the two settings screens behave alike.
  const savedBillPrefix = initial.billNumberPrefix.toUpperCase();
  const savedReceiptPrefix = initial.receiptPrefix.toUpperCase();
  const typedBill = billPrefix.trim().toUpperCase();
  const typedReceipt = receiptPrefix.trim().toUpperCase();

  const billPreview =
    typedBill === savedBillPrefix && previews.bill
      ? previews.bill
      : `${typedBill || "BILL"}-${previews.bill.split("-")[1] ?? ""}-001`;

  const receiptPreview =
    typedReceipt === savedReceiptPrefix && previews.receipt
      ? previews.receipt
      : `${typedReceipt || "RCP"}-${previews.receipt.split("-")[1] ?? ""}-001`;

  const rateNumber = Number.parseFloat(gstRate);
  const half = Number.isFinite(rateNumber) ? rateNumber / 2 : 0;

  return (
    <form action={formAction} className="flex flex-col gap-4 md:gap-6">
      {submitted && !state.ok && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {submitted && state.ok && (
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertDescription>Billing settings saved.</AlertDescription>
        </Alert>
      )}

      {/* ---------------- Numbering & Format ---------------- */}
      <Card>
        <CardHeading
          icon={
            <Save className="size-[18px] text-primary" aria-hidden="true" />
          }
          title="Numbering & Format"
          subtitle="Prefixes used when generating bill and receipt numbers."
        />
        <CardContent className="flex flex-col gap-5">
          <input type="hidden" name="billNumberPrefix" value={billPrefix} />
          <input type="hidden" name="receiptPrefix" value={receiptPrefix} />

          <FieldRow
            label="Bill Number Prefix"
            hint="Used when generating bill numbers"
            preview={`Preview: ${billPreview}`}
          >
            <Input
              value={billPrefix}
              onChange={(e) => setBillPrefix(e.target.value.toUpperCase())}
              placeholder="BILL"
              maxLength={6}
              disabled={!canWrite}
              aria-label="Bill Number Prefix"
              aria-invalid={!!errors.billNumberPrefix}
              className="w-32 text-center font-semibold tracking-widest"
            />
          </FieldRow>
          <FieldError
            id="bill-prefix-error"
            message={errors.billNumberPrefix}
          />

          <hr className="border-hairline-soft" />

          <FieldRow
            label="Receipt ID Prefix"
            hint="Used when generating receipt numbers"
            preview={`Example: ${receiptPreview}`}
          >
            <Input
              value={receiptPrefix}
              onChange={(e) => setReceiptPrefix(e.target.value.toUpperCase())}
              placeholder="RCP"
              maxLength={6}
              disabled={!canWrite}
              aria-label="Receipt ID Prefix"
              aria-invalid={!!errors.receiptPrefix}
              className="w-32 text-center font-semibold tracking-widest"
            />
          </FieldRow>
          <FieldError
            id="receipt-prefix-error"
            message={errors.receiptPrefix}
          />
        </CardContent>
      </Card>

      {/* ---------------- Receipt Preferences ---------------- */}
      <Card>
        <CardHeading
          icon={
            <FileText className="size-[18px] text-primary" aria-hidden="true" />
          }
          title="Receipt Preferences"
          subtitle="How receipts are sent and what they show."
        />
        <CardContent className="flex flex-col gap-5">
          <input
            type="hidden"
            name="autoSendWhatsappReceipt"
            value={autoSend ? "true" : "false"}
          />

          <SwitchRow
            label="Auto-send WhatsApp Receipt"
            hint="Automatically send receipt via WhatsApp after payment"
            checked={autoSend}
            onCheckedChange={setAutoSend}
            disabled={!canWrite}
          />

          <hr className="border-hairline-soft" />

          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center md:gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">
                Receipt Footer Message
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                Displayed at the bottom of printed receipts
              </p>
            </div>
            <Input
              name="receiptFooterMessage"
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              placeholder="Thank you for visiting us."
              disabled={!canWrite}
              aria-invalid={!!errors.receiptFooterMessage}
              className="w-full md:w-64"
            />
          </div>
          <FieldError id="footer-error" message={errors.receiptFooterMessage} />

          <hr className="border-hairline-soft" />

          <div>
            <input
              type="hidden"
              name="showGstOnReceipt"
              value={showGst ? "true" : "false"}
            />
            <SwitchRow
              label="Show GST on Receipt"
              hint="Display GST number and tax on printed receipts"
              checked={showGst}
              onCheckedChange={setShowGst}
              disabled={!canWrite}
            />

            {/* The reference collapses this block behind the switch. Kept
                mounted (rather than unmounted) so a half-typed GST number
                survives the owner toggling the switch off and on again. */}
            <div
              className={
                showGst
                  ? "motion-safe:animate-in motion-safe:fade-in mt-4 flex flex-col gap-3"
                  : "mt-0 hidden"
              }
            >
              <Input
                name="gstNumber"
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                placeholder="Enter GST Number e.g. 08ABCDE1234F1Z5"
                disabled={!canWrite || !showGst}
                aria-label="GST Number"
                aria-invalid={!!errors.gstNumber}
                aria-describedby={
                  errors.gstNumber ? "gst-number-error" : undefined
                }
              />
              <FieldError id="gst-number-error" message={errors.gstNumber} />

              <div>
                <label
                  htmlFor="gst-rate"
                  className="mb-1.5 block text-xs font-medium text-text-secondary"
                >
                  GST Rate %
                </label>
                <Input
                  id="gst-rate"
                  name="gstRate"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                  placeholder="18"
                  disabled={!canWrite || !showGst}
                  aria-invalid={!!errors.gstRate}
                  className="w-32"
                />
                <p className="mt-1 text-xs text-text-muted">
                  {showGst && Number.isFinite(rateNumber)
                    ? `SGST ${half.toFixed(1)}% + CGST ${half.toFixed(1)}%`
                    : "SGST 9.0% + CGST 9.0%"}
                </p>
                <FieldError id="gst-rate-error" message={errors.gstRate} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Bill Terms & Conditions ---------------- */}
      <Card>
        <CardHeading
          icon={
            <Percent className="size-[18px] text-primary" aria-hidden="true" />
          }
          title="Bill Terms & Conditions"
          subtitle="Shown on Bill Detail Modal and Receipt Print View when configured."
        />
        <CardContent>
          <Textarea
            name="billTerms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="Payment must be made at the time of service. No refunds after 30 days."
            disabled={!canWrite}
            aria-invalid={!!errors.billTerms}
            className="min-h-[140px] resize-y"
          />
          <p
            className={
              overLimit
                ? "mt-1 text-xs font-medium text-status-destructive"
                : "mt-1 text-xs text-text-muted"
            }
          >
            {words}/{BILL_TERMS_MAX_WORDS} words
          </p>
          <FieldError id="terms-error" message={errors.billTerms} />
        </CardContent>

        {canWrite && (
          <div className="flex justify-end border-t border-hairline-soft px-4 py-4 md:px-6">
            <SubmitButton loadingText="Saving…">Save changes</SubmitButton>
          </div>
        )}
      </Card>
    </form>
  );
}
