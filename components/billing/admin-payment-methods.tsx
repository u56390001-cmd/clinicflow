"use client";

import { useEffect, useState, useCallback } from "react";
import { useActionState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  getAdminPaymentMethodsAction,
  savePaymentMethodAction,
  deletePaymentMethodAction,
} from "@/lib/actions/billing";
import type { ActionResult } from "@/types";
import type { PaymentMethodType } from "@/types/database";

interface MethodRow {
  id: string;
  type: PaymentMethodType;
  name: string;
  account_title: string | null;
  account_number: string | null;
  iban: string | null;
  instructions: string | null;
  active: boolean;
  sort_order: number;
  [key: string]: unknown;
}

const METHOD_TYPE_OPTIONS: { value: PaymentMethodType; label: string }[] = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "EasyPaisa" },
];

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-48" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

function emptyForm() {
  return {
    id: "",
    type: "bank_transfer" as PaymentMethodType,
    name: "",
    accountTitle: "",
    accountNumber: "",
    iban: "",
    instructions: "",
    sortOrder: "0",
  };
}

export function AdminPaymentMethods() {
  const [loading, setLoading] = useState(true);
  const [methods, setMethods] = useState<MethodRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const [saveState, saveAction] = useActionState(
    savePaymentMethodAction as (
      prev: ActionResult<string> | null,
      fd: FormData,
    ) => Promise<ActionResult<string>>,
    null,
  );

  const [deleteState, deleteAction] = useActionState(
    deletePaymentMethodAction as (
      prev: ActionResult<string> | null,
      fd: FormData,
    ) => Promise<ActionResult<string>>,
    null,
  );

  const loadMethods = useCallback(async () => {
    setLoading(true);
    const result = (await getAdminPaymentMethodsAction()) as ActionResult<MethodRow[]>;
    if (result.ok) {
      setMethods(result.data);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMethods();
  }, [loadMethods]);

  useEffect(() => {
    if (saveState?.ok || deleteState?.ok) {
      loadMethods();
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm());
    }
  }, [saveState, deleteState, loadMethods]);

  const handleEdit = (method: MethodRow) => {
    setEditing(method.id);
    setShowForm(true);
    setForm({
      id: method.id,
      type: method.type,
      name: method.name,
      accountTitle: method.account_title ?? "",
      accountNumber: method.account_number ?? "",
      iban: method.iban ?? "",
      instructions: method.instructions ?? "",
      sortOrder: String(method.sort_order),
    });
  };

  const handleCancel = () => {
    setEditing(null);
    setShowForm(false);
    setForm(emptyForm());
  };

  const handleDelete = (methodId: string) => {
    const fd = new FormData();
    fd.set("methodId", methodId);
    deleteAction(fd);
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          Payment Methods
        </h2>
        {!showForm && (
          <Button size="sm" onClick={() => { setShowForm(true); setEditing(null); setForm(emptyForm()); }}>
            <Plus className="h-4 w-4" />
            Add Method
          </Button>
        )}
      </div>

      {(error || (saveState && !saveState.ok) || (deleteState && !deleteState.ok)) && (
        <Alert variant="destructive">
          <AlertDescription>
            {error || (saveState && !saveState.ok ? saveState.message : null) || (deleteState && !deleteState.ok ? deleteState.message : null)}
          </AlertDescription>
        </Alert>
      )}

      {saveState?.ok && (
        <Alert variant="success">
          <AlertDescription>Payment method saved.</AlertDescription>
        </Alert>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editing ? "Edit Payment Method" : "New Payment Method"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={saveAction} className="space-y-4">
              {editing && <input type="hidden" name="id" value={form.id} />}
              <input type="hidden" name="sortOrder" value={form.sortOrder} />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pm-type">Type</Label>
                  <NativeSelect
                    id="pm-type"
                    name="type"
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as PaymentMethodType }))}
                  >
                    {METHOD_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pm-name">Display Name</Label>
                  <Input
                    id="pm-name"
                    name="name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pm-title">Account Title</Label>
                  <Input
                    id="pm-title"
                    name="accountTitle"
                    value={form.accountTitle}
                    onChange={(e) => setForm((f) => ({ ...f, accountTitle: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pm-number">Account Number</Label>
                  <Input
                    id="pm-number"
                    name="accountNumber"
                    value={form.accountNumber}
                    onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pm-iban">IBAN</Label>
                  <Input
                    id="pm-iban"
                    name="iban"
                    value={form.iban}
                    onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pm-instructions">Instructions</Label>
                <Input
                  id="pm-instructions"
                  name="instructions"
                  value={form.instructions}
                  onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-2">
                <input type="hidden" name="active" value="false" />
                <input
                  type="checkbox"
                  name="active"
                  value="true"
                  defaultChecked
                  className="h-4 w-4 rounded border-text-muted/40 text-primary focus:ring-primary/30"
                />
                <Label htmlFor="pm-active" className="font-normal">
                  Active
                </Label>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  {editing ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {methods.map((method) => (
        <Card key={method.id} className={cn(!method.active && "opacity-60")}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">
                  {method.name}
                </span>
                <Badge variant={method.active ? "default" : "outline"} className="text-xs">
                  {method.active ? "Active" : "Inactive"}
                </Badge>
                <span className="text-xs text-text-muted">
                  {METHOD_TYPE_OPTIONS.find((o) => o.value === method.type)?.label}
                </span>
              </div>
              {method.account_number && (
                <p className="mt-1 text-xs text-text-secondary">
                  {method.account_number}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleEdit(method)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-status-destructive"
                onClick={() => handleDelete(method.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {methods.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-text-muted">
              No payment methods configured yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
