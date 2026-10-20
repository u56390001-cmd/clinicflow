"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { ExternalLink, KeyRound } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  approveRegistrationAction,
  getAdminRegistrationsAction,
  getRegistrationOptionsAction,
  rejectRegistrationAction,
  resendCredentialsAction,
} from "@/lib/actions/registrations";
import { REGISTRATION_STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";
import type { RegistrationRequest } from "@/types/database";

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-48" />
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

/**
 * The approval queue for registration requests.
 *
 * Approving a request is what actually creates the account: the auth user,
 * the clinic, the owner membership and the active subscription are provisioned
 * and the credentials are emailed to the applicant.
 */
export function AdminRegistrationList() {
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<RegistrationRequest[]>([]);
  const [planNames, setPlanNames] = useState<Record<string, string>>({});
  const [methodNames, setMethodNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [approveState, approveAction] = useActionState(
    approveRegistrationAction as (
      prev: ActionResult<string> | null,
      fd: FormData,
    ) => Promise<ActionResult<string>>,
    null,
  );

  const [rejectState, rejectAction] = useActionState(
    rejectRegistrationAction as (
      prev: ActionResult<string> | null,
      fd: FormData,
    ) => Promise<ActionResult<string>>,
    null,
  );

  const [resendState, resendAction] = useActionState(
    resendCredentialsAction as (
      prev: ActionResult<string> | null,
      fd: FormData,
    ) => Promise<ActionResult<string>>,
    null,
  );

  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const rejectModalRef = useRef<HTMLDialogElement>(null);

  const loadRegistrations = useCallback(async (statusFilter: string) => {
    setLoading(true);
    const formData = new FormData();
    if (statusFilter) formData.set("status", statusFilter);
    const result = await getAdminRegistrationsAction(formData);
    if (result.ok) {
      setRegistrations(result.data);
      setError(null);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRegistrations(filter);
  }, [filter, loadRegistrations]);

  useEffect(() => {
    void getRegistrationOptionsAction().then((result) => {
      if (!result.ok) return;
      setPlanNames(
        Object.fromEntries(result.data.plans.map((plan) => [plan.id, plan.name])),
      );
      setMethodNames(
        Object.fromEntries(
          result.data.paymentMethods.map((method) => [method.id, method.name]),
        ),
      );
    });
  }, []);

  useEffect(() => {
    if (approveState?.ok || rejectState?.ok || resendState?.ok) {
      void loadRegistrations(filter);
      setRejectTarget(null);
      rejectModalRef.current?.close();
    }
  }, [approveState, rejectState, resendState, filter, loadRegistrations]);

  useEffect(() => {
    if (rejectTarget) {
      rejectModalRef.current?.showModal();
    }
  }, [rejectTarget]);

  const pendingCount = useMemo(
    () => registrations.filter((row) => row.status === "pending").length,
    [registrations],
  );

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Registration requests
          </h2>
          {pendingCount > 0 && (
            <p className="text-xs text-text-muted">
              {pendingCount} request{pendingCount === 1 ? "" : "s"} waiting for
              verification.
            </p>
          )}
        </div>
        <NativeSelect
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="w-44"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </NativeSelect>
      </div>

      {(error ||
        (approveState && !approveState.ok) ||
        (rejectState && !rejectState.ok) ||
        (resendState && !resendState.ok)) && (
        <Alert variant="destructive">
          <AlertDescription>
            {error ||
              (approveState && !approveState.ok ? approveState.message : null) ||
              (rejectState && !rejectState.ok ? rejectState.message : null) ||
              (resendState && !resendState.ok ? resendState.message : null)}
          </AlertDescription>
        </Alert>
      )}

      {approveState?.ok && (
        <Alert variant="success">
          <AlertDescription>
            Request approved — the account was created and the credentials were
            emailed.
          </AlertDescription>
        </Alert>
      )}

      {rejectState?.ok && (
        <Alert variant="success">
          <AlertDescription>Request rejected and the applicant was notified.</AlertDescription>
        </Alert>
      )}

      {resendState?.ok && (
        <Alert variant="success">
          <AlertDescription>New credentials were emailed to the applicant.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-text-muted/20 text-left text-text-muted">
                <th className="px-6 py-3 font-medium">Applicant</th>
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
              {registrations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-text-muted">
                    No registration requests found.
                  </td>
                </tr>
              ) : (
                registrations.map((row) => {
                  const meta = REGISTRATION_STATUS_META[row.status];
                  return (
                    <tr key={row.id}>
                      <td className="px-6 py-3">
                        <div className="whitespace-nowrap font-medium text-text-primary">
                          {row.full_name}
                        </div>
                        <div className="whitespace-nowrap text-xs text-text-muted">
                          {row.email}
                        </div>
                        <div className="whitespace-nowrap font-mono text-[11px] text-text-muted">
                          {row.reference_code}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-text-secondary">{row.clinic_name}</td>
                      <td className="px-6 py-3 text-text-secondary">
                        {planNames[row.plan_id] ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 font-medium text-text-primary">
                        {row.currency} {row.amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-text-secondary">
                        {methodNames[row.payment_method_id] ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {new Date(row.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3">
                        <Badge className={cn("text-xs", meta?.badge)}>
                          {meta?.label ?? row.status}
                        </Badge>
                        {row.status === "rejected" && row.rejection_reason && (
                          <p className="mt-1 max-w-[16rem] text-xs text-text-muted">
                            {row.rejection_reason}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <div className="flex items-center gap-1">
                          {row.proof_file_path && (
                            <Button asChild variant="ghost" size="sm">
                              <a
                                href={`/api/admin/registrations/${row.id}/proof`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                                <span className="sr-only">View receipt</span>
                              </a>
                            </Button>
                          )}
                          {row.status === "pending" && (
                            <>
                              <form action={approveAction}>
                                <input
                                  type="hidden"
                                  name="registrationId"
                                  value={row.id}
                                />
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
                          {row.status === "approved" && (
                            <form action={resendAction}>
                              <input
                                type="hidden"
                                name="registrationId"
                                value={row.id}
                              />
                              <Button type="submit" variant="ghost" size="sm">
                                <KeyRound className="h-4 w-4" />
                                Resend
                              </Button>
                            </form>
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
        className="rounded-card border border-text-muted/30 bg-surface p-0 shadow-dropdown backdrop:bg-black/50"
        onClose={() => setRejectTarget(null)}
      >
        <div className="p-6">
          <h3 className="text-base font-semibold text-text-primary">Reject request</h3>
          <p className="mt-1 text-sm text-text-secondary">
            The reason is emailed to the applicant, so keep it clear and actionable.
          </p>

          <form action={rejectAction} className="mt-4 space-y-4">
            <input type="hidden" name="registrationId" value={rejectTarget ?? ""} />
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Rejection reason</Label>
              <Input
                id="reject-reason"
                name="reason"
                placeholder="e.g. The receipt amount doesn't match the plan price."
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
                Reject request
              </Button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}
