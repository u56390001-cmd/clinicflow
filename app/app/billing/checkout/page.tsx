"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, FileCheck, Upload, ArrowLeft, ArrowRight, Copy, CheckCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPlansAction, getCheckoutDataAction, submitPaymentAction } from "@/lib/actions/billing";
import type { SubscriptionPlan, PaymentMethod } from "@/types/database";

const STEPS = [
  { label: "Summary", icon: FileCheck, number: 1 },
  { label: "Payment", icon: CreditCard, number: 2 },
  { label: "Upload", icon: Upload, number: 3 },
] as const;

export default function CheckoutPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form fields
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [plansResult, checkoutResult] = await Promise.all([
        getPlansAction(),
        getCheckoutDataAction(),
      ]);
      if (plansResult.ok) setPlans(plansResult.data);
      if (checkoutResult.ok) {
        setPaymentMethods(checkoutResult.data.paymentMethods);
        if (checkoutResult.data.plan) {
          setSelectedPlan(checkoutResult.data.plan);
        }
      }
      setLoading(false);
    }
    load();
  }, []);

  const copyToClipboard = useCallback(async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success("Copied to clipboard");
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      toast.error("File must be JPG, PNG, WebP, or PDF");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10 MB");
      return;
    }
    setProofFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setProofPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setProofPreview(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedPlan || !selectedMethod || !proofFile) return;
    setSubmitting(true);

    const formData = new FormData();
    formData.set("amount", String(selectedPlan.price));
    formData.set("senderName", senderName);
    formData.set("senderPhone", senderPhone);
    formData.set("transactionReference", transactionRef);
    formData.set("paymentMethodId", selectedMethod.id);
    formData.set("notes", notes);
    formData.set("proof", proofFile);

    const result = await submitPaymentAction(null, formData);
    setSubmitting(false);

    if (result.ok) {
      setSubmitted(true);
    } else {
      toast.error(result.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-skeleton" />
        <div className="h-4 w-64 animate-pulse rounded bg-skeleton" />
        <div className="h-64 animate-pulse rounded-card bg-skeleton" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-status-success/10">
          <CheckCircle className="h-8 w-8 text-status-success" />
        </div>
        <h2 className="text-xl font-semibold text-secondary">Payment Proof Submitted</h2>
        <p className="mt-2 max-w-md text-sm text-text-secondary">
          Your payment proof has been submitted and is under review. We&apos;ll notify you once it&apos;s approved.
        </p>
        <Button className="mt-6" onClick={() => router.push("/app/billing")}>
          Back to Billing
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">Checkout</h1>
        <p className="mt-1 text-sm text-text-secondary">Complete your subscription purchase.</p>
      </div>

      {/* Step indicator */}
      <nav aria-label="Checkout steps">
        <ol className="flex items-center">
          {STEPS.map((s, index) => {
            const isCompleted = step > s.number;
            const isCurrent = step === s.number;
            const Icon = s.icon;
            return (
              <li key={s.number} className={cn("flex items-center", index < STEPS.length - 1 && "flex-1")}>
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
                  <span className={cn("text-sm font-medium", isCurrent ? "text-primary" : "text-text-muted")}>
                    {s.label}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div className={cn("mx-3 h-px flex-1", isCompleted ? "bg-primary" : "bg-text-muted/20")} />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step 1: Plan Summary */}
      {step === 1 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Choose a Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={cn(
                      "rounded-card border-2 p-4 text-left transition-all hover:shadow-md",
                      selectedPlan?.id === plan.id
                        ? "border-primary bg-primary/5"
                        : "border-text-muted/20 hover:border-text-muted/40",
                    )}
                  >
                    <div className="text-sm font-semibold text-secondary">{plan.name}</div>
                    <div className="mt-1 text-2xl font-bold text-primary">
                      {plan.currency} {plan.price.toLocaleString()}
                    </div>
                    <div className="text-xs text-text-muted">/ {plan.billing_interval}</div>
                    <ul className="mt-3 space-y-1">
                      {plan.features.map((f) => (
                        <li key={f.key} className="flex items-center gap-1.5 text-xs">
                          <span className={cn("h-1 w-1 rounded-full", f.included ? "bg-status-success" : "bg-text-muted")} />
                          <span className={f.included ? "text-text-primary" : "text-text-muted"}>{f.label}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedPlan && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-text-secondary">Selected Plan</div>
                    <div className="text-lg font-semibold text-secondary">{selectedPlan.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-text-secondary">Amount Due</div>
                    <div className="text-2xl font-bold text-primary">
                      {selectedPlan.currency} {selectedPlan.price.toLocaleString()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button disabled={!selectedPlan} onClick={() => setStep(2)}>
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Payment Method */}
      {step === 2 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Select Payment Method</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method)}
                    className={cn(
                      "rounded-card border-2 p-4 text-left transition-all hover:shadow-md",
                      selectedMethod?.id === method.id
                        ? "border-primary bg-primary/5"
                        : "border-text-muted/20 hover:border-text-muted/40",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-primary" />
                      <span className="text-sm font-semibold text-secondary">{method.name}</span>
                    </div>
                    {method.account_title && (
                      <div className="mt-2 text-xs text-text-secondary">Account: {method.account_title}</div>
                    )}
                    {method.account_number && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="font-mono text-xs text-text-primary">{method.account_number}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(method.account_number!, `acct-${method.id}`); }}
                          className="text-text-muted hover:text-primary"
                        >
                          {copiedField === `acct-${method.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    )}
                    {method.iban && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="font-mono text-xs text-text-primary">{method.iban}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(method.iban!, `iban-${method.id}`); }}
                          className="text-text-muted hover:text-primary"
                        >
                          {copiedField === `iban-${method.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    )}
                    {method.instructions && (
                      <p className="mt-2 text-xs text-text-muted">{method.instructions}</p>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button disabled={!selectedMethod} onClick={() => setStep(3)}>
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Upload Proof */}
      {step === 3 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Payment Proof</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-card border border-dashed border-text-muted/40 p-8 text-center">
                <Upload className="mx-auto h-8 w-8 text-text-muted" />
                <p className="mt-2 text-sm text-text-secondary">
                  Drag and drop or{" "}
                  <label className="cursor-pointer text-primary hover:underline">
                    browse
                    <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFileChange} />
                  </label>
                </p>
                <p className="mt-1 text-xs text-text-muted">JPG, PNG, WebP, or PDF. Max 10 MB.</p>
              </div>

              {proofFile && (
                <div className="flex items-center gap-3 rounded-card border border-text-muted/20 p-3">
                  {proofPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local data-URL preview; not optimizable by next/image
                    <img src={proofPreview} alt="Proof preview" className="h-12 w-12 rounded object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-status-info/10">
                      <FileCheck className="h-6 w-6 text-status-info" />
                    </div>
                  )}
                  <div className="flex-1 truncate text-sm">{proofFile.name}</div>
                  <button type="button" onClick={() => { setProofFile(null); setProofPreview(null); }} className="text-xs text-status-destructive hover:underline">Remove</button>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="senderName">Sender Name *</Label>
                  <Input id="senderName" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Name on account" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="senderPhone">Sender Phone *</Label>
                  <Input id="senderPhone" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} placeholder="03001234567" className="mt-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="txRef">Transaction Reference / ID *</Label>
                <Input id="txRef" value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} placeholder="Transaction ID from your receipt" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional details" className="mt-1" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-text-secondary">Total Amount</div>
                  <div className="text-2xl font-bold text-primary">
                    {selectedPlan?.currency} {selectedPlan?.price.toLocaleString()}
                  </div>
                </div>
                <Badge variant="info">{selectedMethod?.name}</Badge>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              disabled={!proofFile || !senderName || !senderPhone || !transactionRef || submitting}
              onClick={handleSubmit}
            >
              {submitting ? "Submitting..." : "Submit Payment Proof"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
