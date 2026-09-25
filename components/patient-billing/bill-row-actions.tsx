"use client";

import { useTransition, useState } from "react";
import {
  Eye,
  Printer,
  MoreVertical,
  Trash2,
  CheckCircle2,
  Banknote,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  cancelPatientBillAction,
  waivePatientBillAction,
} from "@/lib/actions/patient-billing";
import type { PatientBillListRow } from "@/lib/patient-billing-queries";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export interface BillRowActionsProps {
  bill: PatientBillListRow;
  onViewDetails: () => void;
  onPrintReceipt: () => void;
  onCollectPayment: () => void;
}

/**
 * Row actions for a bill: green Collect button + Eye (view details), Printer
 * (print receipt), and a 3-dot menu with View Details, Collect Payment and
 * Waive/Cancel for owner/admin.
 *
 * Collect is shown while money is still owed (pending, partially_paid). Waive
 * and Cancel are gated server-side on canWriteClinic, but the UI disables them
 * for non-owners/admins as a courtesy (no permission prompt). Status rules are
 * enforced server-side: waive permits (pending, partially_paid), cancel
 * permits (pending only).
 */
export function BillRowActions({
  bill,
  onViewDetails,
  onPrintReceipt,
  onCollectPayment,
}: BillRowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmAction, setConfirmAction] = useState<"waive" | "cancel" | null>(
    null,
  );
  const [reason, setReason] = useState("");

  const label = bill.bill_number ?? "this bill";
  const hasReceipt = bill.receipts.length > 0;

  // Money is still owed — the green Collect Payment action is meaningful.
  const canCollect =
    bill.status === "pending" || bill.status === "partially_paid";

  // Status rules: waive (pending, partially_paid), cancel (pending only)
  const canWaive =
    bill.status === "pending" || bill.status === "partially_paid";
  const canCancel = bill.status === "pending";

  const handleWaive = async () => {
    if (!canWaive) {
      toast.error("Only a pending or partially paid bill can be waived.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("billId", bill.id);
      formData.append("reason", reason);

      const result = await waivePatientBillAction(null, formData);
      if (result.ok) {
        toast.success(`Bill waived`);
        setConfirmAction(null);
        setReason("");
        router.refresh();
      } else {
        toast.error(result.message || "Failed to waive bill.");
      }
    });
  };

  const handleCancel = async () => {
    if (!canCancel) {
      toast.error("Only a pending bill can be cancelled.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("billId", bill.id);
      formData.append("reason", reason);

      const result = await cancelPatientBillAction(null, formData);
      if (result.ok) {
        toast.success(`Bill cancelled`);
        setConfirmAction(null);
        setReason("");
        router.refresh();
      } else {
        toast.error(result.message || "Failed to cancel bill.");
      }
    });
  };

  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        {canCollect && (
          <Button
            size="sm"
            className="h-8 gap-1 bg-status-success px-2.5 text-xs font-semibold text-white hover:bg-status-success/90"
            onClick={onCollectPayment}
            title={`Collect payment for ${label}`}
          >
            <Banknote aria-hidden="true" className="size-3.5" />
            Collect
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onViewDetails}
          title={`View details for ${label}`}
        >
          <Eye aria-hidden="true" className="size-4" />
          <span className="sr-only">View details for {label}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onPrintReceipt}
          disabled={!hasReceipt}
          title={
            hasReceipt
              ? `Print receipt for ${label}`
              : "No receipt yet — collect payment first"
          }
        >
          <Printer aria-hidden="true" className="size-4" />
          <span className="sr-only">Print receipt for {label}</span>
        </Button>

        {/* 3-dot menu: Waive / Cancel */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title="More actions"
            >
              <MoreVertical aria-hidden="true" className="size-4" />
              <span className="sr-only">More actions for {label}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {/* View details — same as the Eye icon */}
            <DropdownMenuItem
              onClick={onViewDetails}
              className="cursor-pointer"
            >
              <Eye className="mr-2 size-4" />
              View Details
            </DropdownMenuItem>

            {/* Collect payment — green, while money is still owed */}
            <DropdownMenuItem
              disabled={!canCollect || pending}
              onClick={onCollectPayment}
              className="cursor-pointer text-status-success focus:text-status-success"
            >
              <Banknote className="mr-2 size-4" />
              Collect Payment
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Waive: pending or partially_paid */}
            <DropdownMenuItem
              disabled={!canWaive || pending}
              onClick={() => setConfirmAction("waive")}
              className="cursor-pointer"
            >
              <CheckCircle2 className="mr-2 size-4" />
              Waive Bill
            </DropdownMenuItem>

            {/* Cancel: pending only */}
            <DropdownMenuItem
              disabled={!canCancel || pending}
              onClick={() => setConfirmAction("cancel")}
              className="cursor-pointer"
            >
              <Trash2 className="mr-2 size-4" />
              Cancel Bill
            </DropdownMenuItem>

            {bill.status !== "pending" && !canWaive && !canCancel && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-xs text-text-muted">
                  {bill.status === "paid"
                    ? "Paid bills cannot be modified"
                    : bill.status === "cancelled"
                      ? "Cancelled bills cannot be modified"
                      : bill.status === "waived"
                        ? "Waived bills cannot be modified"
                        : "This bill cannot be modified"}
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Confirmation dialogs */}
      {confirmAction === "waive" && (
        <ConfirmDialog
          title="Waive Bill"
          description={`Write off bill ${label}? The clinic keeps any payments already collected, and the balance is forgiven. This action is permanent and will be audited.`}
          confirmText="Waive"
          cancelText="Keep Bill"
          variant="warning"
          reason={reason}
          onReasonChange={setReason}
          onConfirm={handleWaive}
          onCancel={() => {
            setConfirmAction(null);
            setReason("");
          }}
          loading={pending}
        />
      )}

      {confirmAction === "cancel" && (
        <ConfirmDialog
          title="Cancel Bill"
          description={`Cancel bill ${label}? Only pending bills (with no payments collected) can be cancelled. This action is permanent and will be audited.`}
          confirmText="Cancel"
          cancelText="Keep Bill"
          variant="destructive"
          reason={reason}
          onReasonChange={setReason}
          onConfirm={handleCancel}
          onCancel={() => {
            setConfirmAction(null);
            setReason("");
          }}
          loading={pending}
        />
      )}
    </>
  );
}
