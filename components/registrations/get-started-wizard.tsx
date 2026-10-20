"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  Copy,
  CreditCard,
  FileCheck,
  Receipt,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitRegistrationAction } from "@/lib/actions/registrations";
import { APP_ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { PaymentMethod, SubscriptionPlan } from "@/types/database";

const STEPS = [
  { label: "Plan", icon: FileCheck, number: 1 },
  { label: "Payment", icon: CreditCard, number: 2 },
  { label: "Details", icon: Receipt, number: 3 },
  { label: "Review", icon: Check, number: 4 },
] as const;

const ALLOWED_FILE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

type GetStartedWizardProps = {
  plans: SubscriptionPlan[];
  paymentMethods: PaymentMethod[];
  /** Plan code preselected from the landing page pricing cards. */
  initialPlanCode?: string;
};

function formatPrice(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}

/**
 * The public registration funnel: plan -> payment method -> details + receipt
 * -> review -> submit. Nothing is created until a platform admin approves the
 * request, so the applicant's account only exists after the manual payment
 * check.
 */
export function GetStartedWizard({
  plans,
  paymentMethods,
  initialPlanCode,
}: GetStartedWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);

  // Applicant details
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");

  // Payment evidence
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Preselect the plan the visitor clicked on the landing page.
  useEffect(() => {
    if (!initialPlanCode) return;
    const match = plans.find((plan) => plan.code === initialPlanCode);
    if (match) setSelectedPlan(match);
  }, [initialPlanCode, plans]);

  /** Everything the applicant still has to provide before the form can go. */
  const missingDetails = useMemo(() => {
    const missing: string[] = [];
    if (!fullName.trim()) missing.push("full name");
    if (!email.includes("@")) missing.push("email address");
    if (phone.trim().length < 3) missing.push("phone number");
    if (!clinicName.trim()) missing.push("clinic name");
    if (!senderName.trim()) missing.push("sender name");
    if (senderPhone.trim().length < 3) missing.push("sender phone");
    if (!transactionRef.trim()) missing.push("transaction reference");
    if (!proofFile) missing.push("payment receipt");
    return missing;
  }, [
    fullName,
    email,
    phone,
    clinicName,
    senderName,
    senderPhone,
    transactionRef,
    proofFile,
  ]);

  const detailsComplete = missingDetails.length === 0;

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success("Copied to clipboard");
  };

  /**
   * Accept a receipt. The type check is deliberately forgiving: the browser
   * reports an empty MIME type for some files (and screenshots taken on
   * phones can arrive as HEIC), so the extension is used as the fallback.
   */
  const attachProof = (file: File) => {
    const type = file.type ?? "";
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const looksSupported =
      type.startsWith("image/") ||
      type === "application/pdf" ||
      ALLOWED_FILE_EXTENSIONS.includes(extension);

    if (!looksSupported) {
      toast.error("The receipt must be an image or a PDF file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("The receipt file must be under 10 MB.");
      return;
    }

    setProofFile(file);
    if (type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => setProofPreview(event.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setProofPreview(null);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    attachProof(file);
  };

  /**
   * A dropped file must never reach the browser's default handling — that
   * navigates the page to the file and throws the whole form away.
   */
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) attachProof(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleSubmit = async () => {
    if (!selectedPlan || !selectedMethod || !proofFile) return;
    setSubmitting(true);

    const formData = new FormData();
    formData.set("fullName", fullName);
    formData.set("email", email);
    formData.set("phone", phone);
    formData.set("clinicName", clinicName);
    formData.set("clinicAddress", clinicAddress);
    formData.set("planId", selectedPlan.id);
    formData.set("paymentMethodId", selectedMethod.id);
    formData.set("senderName", senderName);
    formData.set("senderPhone", senderPhone);
    formData.set("transactionReference", transactionRef);
    formData.set("notes", notes);
    formData.set("proof", proofFile);

    const result = await submitRegistrationAction(formData);
    setSubmitting(false);

    if (result.ok) {
      setReferenceCode(result.data.referenceCode);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      toast.error(result.message);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Success                                                            */
  /* ------------------------------------------------------------------ */

  if (referenceCode) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <Card>
          <CardContent className="p-8 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-status-success/10">
              <CheckCircle className="h-8 w-8 text-status-success" />
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-text-primary">
              Request received
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
              We&apos;ve received your request for the{" "}
              <strong className="text-text-primary">{selectedPlan?.name}</strong> plan.
              Our team verifies every payment manually — once it&apos;s confirmed we email
              your login credentials to <strong className="text-text-primary">{email}</strong>.
            </p>

            <div className="mx-auto mt-6 max-w-sm rounded-card border border-hairline bg-app p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Your reference code
              </div>
              <div className="mt-1 font-mono text-2xl font-bold tracking-wider text-text-primary">
                {referenceCode}
              </div>
              <p className="mt-2 text-xs text-text-muted">
                Keep this code — you can use it to check the status of your request.
              </p>
            </div>

            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <Button asChild>
                <Link href={`${APP_ROUTES.getStartedStatus}?code=${referenceCode}`}>
                  Check request status
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={APP_ROUTES.auth.login}>Go to login</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Wizard                                                             */
  /* ------------------------------------------------------------------ */

  return (
    // The page-level drop guard matters: without it a file dropped anywhere
    // outside the dropzone makes the browser navigate to that file and the
    // half-filled form is lost.
    <div
      className="mx-auto w-full max-w-5xl space-y-6"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          Get started with MedBook AI
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-text-secondary">
          Choose your plan, pay by transfer or mobile wallet, and send us the receipt.
          We verify the payment and email your account credentials — usually the same day.
        </p>
      </div>

      {/* Stepper */}
      <nav aria-label="Registration steps">
        <ol className="flex items-center">
          {STEPS.map((s, index) => {
            const isCompleted = step > s.number;
            const isCurrent = step === s.number;
            const Icon = s.icon;
            return (
              <li
                key={s.number}
                className={cn(
                  "flex items-center",
                  index < STEPS.length - 1 && "flex-1",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                      isCompleted && "bg-primary text-white",
                      isCurrent && "border-2 border-primary text-primary",
                      !isCompleted && !isCurrent && "border-2 border-text-muted/30 text-text-muted",
                    )}
                  >
                    {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span
                    className={cn(
                      "hidden text-sm font-medium sm:inline",
                      isCurrent ? "text-primary" : "text-text-muted",
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "mx-3 h-px flex-1",
                      isCompleted ? "bg-primary" : "bg-text-muted/20",
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          {/* Step 1 — Plan */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Choose your plan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
                      className={cn(
                        "rounded-card border-2 p-4 text-left transition-all hover:shadow-card",
                        selectedPlan?.id === plan.id
                          ? "border-primary bg-primary/5"
                          : "border-text-muted/20 hover:border-text-muted/40",
                      )}
                    >
                      <div className="text-sm font-semibold text-text-primary">
                        {plan.name}
                      </div>
                      <div className="mt-1 text-xl font-bold text-primary">
                        {formatPrice(plan.price, plan.currency)}
                      </div>
                      <div className="text-xs text-text-muted">
                        / {plan.billing_interval}
                      </div>
                      <ul className="mt-3 space-y-1">
                        {plan.features.map((feature) => (
                          <li key={feature.key} className="flex items-center gap-1.5 text-xs">
                            <span
                              className={cn(
                                "h-1 w-1 rounded-full",
                                feature.included ? "bg-status-success" : "bg-text-muted",
                              )}
                            />
                            <span
                              className={
                                feature.included ? "text-text-primary" : "text-text-muted"
                              }
                            >
                              {feature.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>

                <div className="mt-6 flex justify-end">
                  <Button disabled={!selectedPlan} onClick={() => setStep(2)}>
                    Next <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2 — Payment method */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Select how you&apos;ll pay</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-text-secondary">
                  Pay the exact amount to the account below, then upload the receipt on
                  the next step.
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedMethod(method)}
                      className={cn(
                        "rounded-card border-2 p-4 text-left transition-all hover:shadow-card",
                        selectedMethod?.id === method.id
                          ? "border-primary bg-primary/5"
                          : "border-text-muted/20 hover:border-text-muted/40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-primary" />
                        <span className="text-sm font-semibold text-text-primary">
                          {method.name}
                        </span>
                      </div>
                      {method.account_title && (
                        <div className="mt-2 text-xs text-text-secondary">
                          Account: {method.account_title}
                        </div>
                      )}
                      {method.account_number && (
                        <div className="mt-1 flex items-center gap-1">
                          <span className="font-mono text-xs text-text-primary">
                            {method.account_number}
                          </span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              copyToClipboard(method.account_number!, `acct-${method.id}`);
                            }}
                            className="text-text-muted hover:text-primary"
                            aria-label="Copy account number"
                          >
                            {copiedField === `acct-${method.id}` ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      )}
                      {method.iban && (
                        <div className="mt-1 flex items-center gap-1">
                          <span className="font-mono text-xs text-text-primary">
                            {method.iban}
                          </span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              copyToClipboard(method.iban!, `iban-${method.id}`);
                            }}
                            className="text-text-muted hover:text-primary"
                            aria-label="Copy IBAN"
                          >
                            {copiedField === `iban-${method.id}` ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      )}
                      {method.instructions && (
                        <p className="mt-2 text-xs leading-relaxed text-text-muted">
                          {method.instructions}
                        </p>
                      )}
                    </button>
                  ))}
                </div>

                <div className="mt-6 flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button disabled={!selectedMethod} onClick={() => setStep(3)}>
                    Next <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3 — Details + receipt */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Your details and payment receipt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="fullName">Full name *</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Dr. Ayesha Khan"
                      className="mt-1"
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email address *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@clinic.com"
                      className="mt-1"
                      autoComplete="email"
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      Your login credentials are sent to this address.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone number *</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="03001234567"
                      className="mt-1"
                      autoComplete="tel"
                    />
                  </div>
                  <div>
                    <Label htmlFor="clinicName">Clinic name *</Label>
                    <Input
                      id="clinicName"
                      value={clinicName}
                      onChange={(event) => setClinicName(event.target.value)}
                      placeholder="Ayesha Dental Clinic"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="clinicAddress">Clinic address (optional)</Label>
                  <Input
                    id="clinicAddress"
                    value={clinicAddress}
                    onChange={(event) => setClinicAddress(event.target.value)}
                    placeholder="House 12, Street 4, Lahore"
                    className="mt-1"
                  />
                </div>

                <div className="border-t border-hairline pt-5">
                  <h3 className="text-sm font-semibold text-text-primary">
                    Payment proof
                  </h3>
                  <p className="mt-1 text-xs text-text-muted">
                    Transfer{" "}
                    {selectedPlan
                      ? formatPrice(selectedPlan.price, selectedPlan.currency)
                      : "the plan amount"}{" "}
                    to the {selectedMethod?.name ?? "chosen account"}, then upload the
                    receipt screenshot.
                  </p>

                  <div
                    data-proof-dropzone
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragOver}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={cn(
                      "mt-3 rounded-card border border-dashed p-8 text-center transition-colors",
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "border-text-muted/40",
                    )}
                  >
                    <Upload
                      className={cn(
                        "mx-auto h-8 w-8",
                        isDragging ? "text-primary" : "text-text-muted",
                      )}
                    />
                    <p className="mt-2 text-sm text-text-secondary">
                      Drag &amp; drop the receipt here, or{" "}
                      <label className="cursor-pointer font-medium text-primary hover:underline">
                        choose a file
                        <input
                          type="file"
                          className="sr-only"
                          accept="image/*,application/pdf"
                          onChange={handleFileChange}
                        />
                      </label>
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      JPG, PNG, WebP, or PDF. Max 10 MB.
                    </p>
                  </div>

                  {proofFile && (
                    <div className="mt-3 flex items-center gap-3 rounded-card border border-text-muted/20 p-3">
                      {proofPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element -- local data-URL preview; not optimizable by next/image
                        <img
                          src={proofPreview}
                          alt="Receipt preview"
                          className="h-12 w-12 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded bg-status-info/10">
                          <FileCheck className="h-6 w-6 text-status-info" />
                        </div>
                      )}
                      <div className="flex-1 truncate text-sm text-text-primary">
                        {proofFile.name}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setProofFile(null);
                          setProofPreview(null);
                        }}
                        className="text-xs text-status-destructive hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 border-t border-hairline pt-5 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="senderName">Sender name *</Label>
                    <Input
                      id="senderName"
                      value={senderName}
                      onChange={(event) => setSenderName(event.target.value)}
                      placeholder="Name on the account"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="senderPhone">Sender phone *</Label>
                    <Input
                      id="senderPhone"
                      value={senderPhone}
                      onChange={(event) => setSenderPhone(event.target.value)}
                      placeholder="03001234567"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="transactionRef">Transaction reference / ID *</Label>
                  <Input
                    id="transactionRef"
                    value={transactionRef}
                    onChange={(event) => setTransactionRef(event.target.value)}
                    placeholder="Transaction ID from your receipt"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Anything our verification team should know"
                    className="mt-1"
                    rows={3}
                  />
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <div className="flex flex-col items-end gap-1">
                    <Button disabled={!detailsComplete} onClick={() => setStep(4)}>
                      Review <ArrowRight className="h-4 w-4" />
                    </Button>
                    {!detailsComplete && (
                      <p className="text-xs text-text-muted">
                        Still needed: {missingDetails.join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4 — Review */}
          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle>Review and submit</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-card border border-hairline p-4">
                    <dt className="text-xs uppercase tracking-wide text-text-muted">
                      Plan
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-text-primary">
                      {selectedPlan?.name} ·{" "}
                      {selectedPlan
                        ? formatPrice(selectedPlan.price, selectedPlan.currency)
                        : ""}
                    </dd>
                  </div>
                  <div className="rounded-card border border-hairline p-4">
                    <dt className="text-xs uppercase tracking-wide text-text-muted">
                      Payment method
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-text-primary">
                      {selectedMethod?.name}
                    </dd>
                  </div>
                  <div className="rounded-card border border-hairline p-4">
                    <dt className="text-xs uppercase tracking-wide text-text-muted">
                      Clinic
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-text-primary">
                      {clinicName}
                    </dd>
                    {clinicAddress && (
                      <dd className="mt-0.5 text-xs text-text-muted">{clinicAddress}</dd>
                    )}
                  </div>
                  <div className="rounded-card border border-hairline p-4">
                    <dt className="text-xs uppercase tracking-wide text-text-muted">
                      Applicant
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-text-primary">
                      {fullName}
                    </dd>
                    <dd className="mt-0.5 text-xs text-text-muted">
                      {email} · {phone}
                    </dd>
                  </div>
                </dl>

                <div className="rounded-card border border-hairline p-4">
                  <div className="text-xs uppercase tracking-wide text-text-muted">
                    Payment proof
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-text-primary">
                    <FileCheck className="h-4 w-4 text-status-success" />
                    {proofFile?.name}
                  </div>
                  <div className="mt-2 text-xs text-text-muted">
                    Reference {transactionRef} · {senderName} · {senderPhone}
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-text-muted">
                  By submitting you confirm the payment was made to our account and
                  the details above are correct. Your account is created once our team
                  verifies the payment — the credentials are emailed to{" "}
                  <strong className="text-text-secondary">{email}</strong>.
                </p>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(3)}>
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting || !selectedPlan || !selectedMethod}
                  >
                    {submitting ? "Submitting…" : "Submit request"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Order summary */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Plan</span>
                <span className="font-medium text-text-primary">
                  {selectedPlan?.name ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Billing</span>
                <span className="font-medium text-text-primary">
                  {selectedPlan?.billing_interval ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Method</span>
                <span className="font-medium text-text-primary">
                  {selectedMethod?.name ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-hairline pt-3">
                <span className="font-medium text-text-primary">Amount due</span>
                <span className="text-lg font-bold text-primary">
                  {selectedPlan
                    ? formatPrice(selectedPlan.price, selectedPlan.currency)
                    : "—"}
                </span>
              </div>
              {selectedMethod && (
                <Badge variant="info" className="mt-1">
                  {selectedMethod.type.replace("_", " ")}
                </Badge>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
