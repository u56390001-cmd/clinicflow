"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubscriptionBadge } from "@/components/billing/subscription-badge";
import { cn } from "@/lib/utils";
import { PAYMENT_STATUS_META } from "@/lib/constants";
import { APP_ROUTES } from "@/lib/constants";
import { getSubscriptionAction, getSubmissionsAction } from "@/lib/actions/billing";
import type { ActionResult } from "@/types";
import type { SubscriptionStatus } from "@/types/database";

interface SubscriptionData {
  id: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  [key: string]: unknown;
}

interface PlanData {
  name: string;
  price: number;
  currency: string;
  billing_interval: string;
  [key: string]: unknown;
}

interface SubmissionRow {
  id: string;
  created_at: string;
  amount: number;
  currency: string;
  status: string;
  transaction_reference: string;
  subscription_plans?: { name: string } | null;
  payment_methods?: { name: string } | null;
  [key: string]: unknown;
}

function isExpiringSoon(endDate: string | null): boolean {
  if (!endDate) return false;
  const end = new Date(endDate);
  const now = new Date();
  const daysLeft = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysLeft <= 7 && daysLeft > 0;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export function BillingDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const [subResult, submissionsResult] = await Promise.all([
        getSubscriptionAction() as Promise<ActionResult<{ subscription: SubscriptionData | null; plan: PlanData | null }>>,
        getSubmissionsAction() as Promise<ActionResult<SubmissionRow[]>>,
      ]);

      if (subResult.ok) {
        setSubscription(subResult.data.subscription);
        setPlan(subResult.data.plan);
      } else {
        setError(subResult.message);
      }

      if (submissionsResult.ok) {
        setSubmissions(submissionsResult.data);
      }

      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <LoadingSkeleton />;

  const showExpiryCTA =
    subscription?.status === "active" &&
    subscription.current_period_end &&
    isExpiringSoon(subscription.current_period_end);

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Billing</h2>
          <p className="text-sm text-text-secondary">
            Manage your subscription and payment history.
          </p>
        </div>
      </div>

      {subscription && plan ? (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Current Subscription</CardTitle>
              <SubscriptionBadge
                status={subscription.status}
                planName={plan.name}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-text-muted">Plan</p>
                  <p className="font-medium text-text-primary">{plan.name}</p>
                </div>
                <div>
                  <p className="text-text-muted">Amount</p>
                  <p className="font-medium text-text-primary">
                    {plan.currency} {plan.price.toLocaleString()}/{plan.billing_interval}
                  </p>
                </div>
                <div>
                  <p className="text-text-muted">Start</p>
                  <p className="font-medium text-text-primary">
                    {subscription.current_period_start
                      ? new Date(subscription.current_period_start).toLocaleDateString()
                      : "\u2014"}
                  </p>
                </div>
                <div>
                  <p className="text-text-muted">End</p>
                  <p className="font-medium text-text-primary">
                    {subscription.current_period_end
                      ? new Date(subscription.current_period_end).toLocaleDateString()
                      : "\u2014"}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                {showExpiryCTA && (
                  <Button
                    size="sm"
                    onClick={() => router.push(APP_ROUTES.app.billingCheckout)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Renew Subscription
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(APP_ROUTES.app.billingCheckout)}
                >
                  Change Plan
                </Button>
              </div>
            </CardContent>
          </Card>

          {submissions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-text-muted/20 text-left text-text-muted">
                        <th className="pb-3 pr-4 font-medium">Date</th>
                        <th className="pb-3 pr-4 font-medium">Plan</th>
                        <th className="pb-3 pr-4 font-medium">Amount</th>
                        <th className="pb-3 pr-4 font-medium">Method</th>
                        <th className="pb-3 pr-4 font-medium">Reference</th>
                        <th className="pb-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-text-muted/10">
                      {submissions.map((row) => {
                        const meta = PAYMENT_STATUS_META[row.status];
                        return (
                          <tr key={row.id}>
                            <td className="whitespace-nowrap py-3 pr-4 text-text-primary">
                              {new Date(row.created_at).toLocaleDateString()}
                            </td>
                            <td className="whitespace-nowrap py-3 pr-4 text-text-primary">
                              {row.subscription_plans?.name ?? "\u2014"}
                            </td>
                            <td className="whitespace-nowrap py-3 pr-4 font-medium text-text-primary">
                              {row.currency} {row.amount.toLocaleString()}
                            </td>
                            <td className="whitespace-nowrap py-3 pr-4 text-text-secondary">
                              {row.payment_methods?.name ?? "\u2014"}
                            </td>
                            <td className="whitespace-nowrap py-3 pr-4 font-mono text-xs text-text-secondary">
                              {row.transaction_reference}
                            </td>
                            <td className="py-3">
                              <Badge className={cn("text-xs", meta?.badge)}>
                                {meta?.label ?? row.status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CreditCard className="mb-4 h-12 w-12 text-text-muted" />
            <h3 className="text-lg font-semibold text-text-primary">
              No Active Subscription
            </h3>
            <p className="mt-1 max-w-sm text-sm text-text-secondary">
              Subscribe to a plan to unlock MedBook AI features for your clinic.
            </p>
            <Button
              className="mt-4"
              onClick={() => router.push(APP_ROUTES.app.billingCheckout)}
            >
              View Plans
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
