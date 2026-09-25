"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useActionState } from "react";
import { ExternalLink } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PAYMENT_STATUS_META } from "@/lib/constants";
import {
  getAdminSubmissionsAction,
  approvePaymentAction,
  rejectPaymentAction,
} from "@/lib/actions/billing";
import type { ActionResult } from "@/types";

interface SubmissionRow {
  id: string;
  clinic_id: string;
  created_at: string;
  amount: number;
  currency: string;
  status: string;
  sender_name: string;
  transaction_reference: string;
  proof_file_path: string | null;
  rejection_reason: string | null;
  clinics?: { name: string } | null;
  subscription_plans?: { name: string } | null;
  payment_methods?: { name: string } | null;
  [key: string]: unknown;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-48" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function AdminSubmissionList() {
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [approveState, approveAction] = useActionState(
    approvePaymentAction as (
      prev: ActionResult<string> | null,
      fd: FormData,
    ) => Promise<ActionResult<string>>,
    null,
  );

  const [rejectState, rejectAction] = useActionState(
    rejectPaymentAction as (
      prev: ActionResult<string> | null,
      fd: FormData,
    ) => Promise<ActionResult<string>>,
    null,
  );

  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const rejectModalRef = useRef<HTMLDialogElement>(null);

  const loadSubmissions = useCallback(async (statusFilter: string) => {
    setLoading(true);
    const fd = new FormData();
    fd.set("status", statusFilter);
    const result = (await getAdminSubmissionsAction(null, fd)) as ActionResult<SubmissionRow[]>;
    if (result.ok) {
      setSubmissions(result.data);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSubmissions(filter);
  }, [filter, loadSubmissions]);

  useEffect(() => {
    if (approveState?.ok || rejectState?.ok) {
      loadSubmissions(filter);
      setRejectTarget(null);
      rejectModalRef.current?.close();
    }
  }, [approveState, rejectState, filter, loadSubmissions]);

  useEffect(() => {
    if (rejectTarget) {
      rejectModalRef.current?.showModal();
    }
  }, [rejectTarget]);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          Payment Submissions
        </h2>
        <NativeSelect
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-40"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </NativeSelect>
      </div>

      {(error || (approveState && !approveState.ok) || (rejectState && !rejectState.ok)) && (
        <Alert variant="destructive">
          <AlertDescription>
            {error || (approveState && !approveState.ok ? approveState.message : null) || (rejectState && !rejectState.ok ? rejectState.message : null)}
          </AlertDescription>
        </Alert>
      )}

      {approveState?.ok && (
        <Alert variant="success">
          <AlertDescription>Payment approved successfully.</AlertDescription>
        </Alert>
      )}

      {rejectState?.ok && (
        <Alert variant="success">
          <AlertDescription>Payment rejected.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-text-muted/20 text-left text-text-muted">
                <th className="px-6 py-3 font-medium">Clinic</th>
                <th className="px-6 py-3 font-medium">Plan</th>
                <th className="px-6 py-3 font-medium">Amount</th>
                <th className="px-6 py-3 font-medium">Method</th>
                <th className="px-6 py-3 font-medium">Submitted</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-text-muted/10">
              {submissions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-text-muted">
                    No submissions found.
                  </td>
                </tr>
              ) : (
                submissions.map((row) => {
                  const meta = PAYMENT_STATUS_META[row.status];
                  return (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap px-6 py-3 font-medium text-text-primary">
                        {row.clinics?.name ?? "\u2014"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {row.subscription_plans?.name ?? "\u2014"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 font-medium text-text-primary">
                        {row.currency} {row.amount.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {row.payment_methods?.name ?? "\u2014"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {new Date(row.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3">
                        <Badge className={cn("text-xs", meta?.badge)}>
                          {meta?.label ?? row.status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <div className="flex items-center gap-1">
                          {row.proof_file_path && (
                            <Button asChild variant="ghost" size="sm">
                              <a
                                href={row.proof_file_path}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          {row.status === "pending" && (
                            <>
                              <form action={approveAction}>
                                <input type="hidden" name="submissionId" value={row.id} />
                                <Button type="submit" variant="ghost" size="sm">
                                  Approve
                                </Button>
                              </form>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setRejectTarget(row.id)}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <dialog
        ref={rejectModalRef}
        className="rounded-card border border-text-muted/30 bg-surface p-0 shadow-lg backdrop:bg-black/50"
        onClose={() => setRejectTarget(null)}
      >
        <div className="p-6">
          <h3 className="text-base font-semibold text-text-primary">
            Reject Payment
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            Provide a reason for rejecting this payment submission.
          </p>

          <form
            action={rejectAction}
            className="mt-4 space-y-4"
          >
            <input type="hidden" name="submissionId" value={rejectTarget ?? ""} />
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Rejection Reason</Label>
              <Input
                id="reject-reason"
                name="reason"
                placeholder="Enter reason for rejection..."
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejectTarget(null);
                  rejectModalRef.current?.close();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" size="sm">
                Reject Payment
              </Button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}
