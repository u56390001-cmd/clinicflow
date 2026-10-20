"use client";

import { useState } from "react";
import { CheckCircle, Clock, Search, XCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getRegistrationStatusAction,
  type RegistrationStatusView,
} from "@/lib/actions/registrations";
import { REGISTRATION_STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Lets an applicant check on their request before they have an account. The
 * reference code is the only credential needed — the lookup is a
 * `security definer` function that returns a small projection.
 */
export function RegistrationStatusLookup({
  initialCode,
}: {
  initialCode?: string;
}) {
  const [code, setCode] = useState(initialCode ?? "");
  const [status, setStatus] = useState<RegistrationStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setLoading(true);
    setError(null);
    setStatus(null);
    const result = await getRegistrationStatusAction(code);
    setLoading(false);
    if (result.ok) {
      setStatus(result.data);
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Check your request</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="reference">Reference code</Label>
            <div className="flex gap-2">
              <Input
                id="reference"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="MED-XXXXXX"
                className="font-mono"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void check();
                  }
                }}
              />
              <Button onClick={check} disabled={loading || code.trim().length < 4}>
                <Search className="h-4 w-4" />
                {loading ? "Checking…" : "Check"}
              </Button>
            </div>
            <p className="text-xs text-text-muted">
              The reference code was shown on the confirmation screen when you
              submitted the request.
            </p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {status && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center gap-2">
              {status.status === "approved" && (
                <CheckCircle className="h-5 w-5 text-status-success" />
              )}
              {status.status === "pending" && (
                <Clock className="h-5 w-5 text-status-warning" />
              )}
              {status.status === "rejected" && (
                <XCircle className="h-5 w-5 text-status-destructive" />
              )}
              <span
                className={cn(
                  "rounded-pill px-2.5 py-0.5 text-xs font-medium",
                  REGISTRATION_STATUS_META[status.status]?.badge,
                )}
              >
                {REGISTRATION_STATUS_META[status.status]?.label ?? status.status}
              </span>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">Reference</dt>
                <dd className="font-mono text-text-primary">{status.referenceCode}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Clinic</dt>
                <dd className="font-medium text-text-primary">{status.clinicName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Plan</dt>
                <dd className="font-medium text-text-primary">{status.planName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Amount</dt>
                <dd className="font-medium text-text-primary">
                  {status.currency} {status.amount.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Submitted</dt>
                <dd className="text-text-primary">
                  {new Date(status.createdAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>

            {status.status === "approved" && (
              <p className="text-sm text-text-secondary">
                Your payment is verified and your account is ready. Sign in with the
                credentials we emailed you.
              </p>
            )}
            {status.status === "pending" && (
              <p className="text-sm text-text-secondary">
                We&apos;re verifying your payment. You&apos;ll receive your login
                credentials by email as soon as it&apos;s confirmed.
              </p>
            )}
            {status.status === "rejected" && (
              <p className="text-sm text-text-secondary">
                We couldn&apos;t verify this payment
                {status.rejectionReason ? `: ${status.rejectionReason}` : "."} Please
                submit the request again with a clear receipt.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
