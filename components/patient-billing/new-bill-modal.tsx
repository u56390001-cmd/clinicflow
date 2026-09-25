"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { X, Plus, Trash2, Search, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { searchPatientsAction } from "@/lib/actions/patient-search";
import {
  createPatientBillAction,
} from "@/lib/actions/patient-billing";
import { createPatientAndGetIdAction } from "@/lib/actions/patients";
import {
  listClinicDoctorsAction,
  type ClinicDoctorOption,
} from "@/lib/actions/doctors";
import { DEFAULT_CURRENCY, formatCurrency } from "@/lib/utils/currency";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface PatientResult {
  id: string;
  name: string;
  phone: string | null;
}

interface NewBillModalProps {
  patientId?: string;
  visitId?: string;
  defaultItems?: LineItem[];
  onClose: () => void;
}

export function NewBillModal({
  patientId: initialPatientId,
  visitId,
  defaultItems,
  onClose,
}: NewBillModalProps) {
  const [step, setStep] = useState<"patient" | "items">(
    initialPatientId ? "items" : "patient",
  );
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(
    null,
  );
  const [phoneQuery, setPhoneQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PatientResult[]>([]);
  const [isSearching, startSearch] = useTransition();

  const [showAddPatient, setShowAddPatient] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [isAdding, startAdd] = useTransition();

  const [doctors, setDoctors] = useState<ClinicDoctorOption[]>([]);
  const [doctorId, setDoctorId] = useState("");

  const [items, setItems] = useState<LineItem[]>(
    defaultItems?.length
      ? defaultItems
      : [{ description: "", quantity: 1, unit_price: 0 }],
  );
  const [billType, setBillType] = useState<"consultation" | "procedure" | "other">("consultation");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (initialPatientId) {
      setSelectedPatient({ id: initialPatientId, name: "", phone: null });
    }
  }, [initialPatientId]);

  useEffect(() => {
    let cancelled = false;
    listClinicDoctorsAction().then((res) => {
      if (!cancelled && res.ok) setDoctors(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = useCallback(() => {
    if (phoneQuery.length < 2) {
      toast.error("Enter at least 2 characters to search.");
      return;
    }
    startSearch(async () => {
      const results = await searchPatientsAction(phoneQuery);
      setSearchResults(
        results.map((r) => ({ id: r.id, name: r.name, phone: r.phone })),
      );
    });
  }, [phoneQuery]);

  const selectPatient = useCallback((patient: PatientResult) => {
    setSelectedPatient(patient);
    setStep("items");
  }, []);

  const handleAddPatient = useCallback(() => {
    if (!newName.trim()) {
      toast.error("Enter the patient's name.");
      return;
    }
    startAdd(async () => {
      const fd = new FormData();
      fd.set("name", newName.trim());
      fd.set("phone", newPhone.trim());
      fd.set("email", "");
      fd.set("notes", "");
      fd.set("dateOfBirth", "");
      const res = await createPatientAndGetIdAction(fd);
      if (res.ok && res.data) {
        setSelectedPatient({ id: res.data, name: newName.trim(), phone: newPhone.trim() || null });
        setShowAddPatient(false);
        setNewName("");
        setNewPhone("");
        setStep("items");
      } else {
        toast.error(res.ok ? "Could not find the new patient." : res.message);
      }
    });
  }, [newName, newPhone]);

  const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

  const addItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      { description: "", quantity: 1, unit_price: 0 },
    ]);
  }, []);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateItem = useCallback(
    (idx: number, field: keyof LineItem, value: string | number) => {
      setItems((prev) =>
        prev.map((item, i) =>
          i === idx ? { ...item, [field]: value } : item,
        ),
      );
    },
    [],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedPatient?.id) {
        toast.error("Select a patient first.");
        return;
      }
      const validItems = items.filter((i) => i.description);
      if (validItems.length === 0) {
        toast.error("Add at least one line item.");
        return;
      }

      const fd = new FormData();
      fd.set("patientId", selectedPatient.id);
      if (visitId) fd.set("visitId", visitId);
      fd.set("items", JSON.stringify(validItems));
      fd.set("bill_type", billType);
      if (doctorId) fd.set("doctorId", doctorId);

      startTransition(async () => {
        const res = await createPatientBillAction(null, fd);
        if (res.ok) {
          toast.success("Bill created successfully!");
          onClose();
        } else {
          toast.error(res.message);
        }
      });
    },
    [selectedPatient, visitId, items, billType, doctorId, onClose],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/50 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">New Bill</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {step === "patient" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient Phone or Name</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by phone or name..."
                    value={phoneQuery}
                    onChange={(e) => setPhoneQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSearch}
                    disabled={isSearching}
                  >
                    <Search className="size-4" />
                  </Button>
                </div>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-text-muted">Select a patient:</p>
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPatient(p)}
                      className="flex w-full items-center gap-2 rounded-control border p-2 text-left text-sm transition-colors hover:bg-app"
                    >
                      <span className="font-medium">{p.name}</span>
                      {p.phone && (
                        <span className="text-text-muted">{p.phone}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {phoneQuery.length >= 2 &&
                searchResults.length === 0 &&
                !isSearching && (
                  <div className="space-y-3 rounded-control border border-text-muted/20 bg-app/50 p-3">
                    <p className="text-sm text-text-muted">
                      No patients found.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setShowAddPatient(true);
                        setPhoneQuery("");
                      }}
                    >
                      <UserPlus className="mr-2 size-4" />
                      Add new patient
                    </Button>
                  </div>
                )}

              {(showAddPatient || (!isSearching && phoneQuery.length === 0 && searchResults.length === 0)) && (
                <div className="space-y-3 rounded-control border border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-primary">
                      Add new patient
                    </p>
                    {showAddPatient && (
                      <button
                        type="button"
                        onClick={() => setShowAddPatient(false)}
                        className="text-xs text-text-muted hover:text-text-primary"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Input
                      placeholder="Full name *"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <Input
                      placeholder="Phone"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleAddPatient}
                    disabled={isAdding || !newName.trim()}
                  >
                    {isAdding ? "Adding..." : "Add & continue"}
                  </Button>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={onClose}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {selectedPatient && (
                <div className="rounded-control bg-app p-2 text-sm">
                  <span className="font-medium">{selectedPatient.name}</span>
                  {selectedPatient.phone && (
                    <span className="ml-2 text-text-muted">
                      {selectedPatient.phone}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-2 h-6 text-xs"
                    onClick={() => {
                      setSelectedPatient(null);
                      setStep("patient");
                    }}
                  >
                    Change
                  </Button>
                </div>
              )}

              {/* Bill Type Selector */}
              <div className="space-y-2">
                <Label>Bill Type</Label>
                <div className="flex flex-wrap gap-2">
                  {(["consultation", "procedure", "other"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setBillType(type)}
                      className={`inline-flex items-center rounded-pill border px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                        billType === type
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-text-muted/30 text-text-secondary hover:bg-app"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Doctor */}
              {doctors.length > 0 && (
                <div className="space-y-2">
                  <Label>Doctor (optional)</Label>
                  <NativeSelect
                    value={doctorId}
                    onChange={(e) => setDoctorId(e.target.value)}
                  >
                    <option value="">No doctor selected</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.specialty ? ` — ${d.specialty}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}

              <div className="space-y-3">
                <Label>Line Items</Label>
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) =>
                        updateItem(idx, "description", e.target.value)
                      }
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(
                          idx,
                          "quantity",
                          Number(e.target.value) || 1,
                        )
                      }
                      className="w-20"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price || ""}
                      onChange={(e) =>
                        updateItem(
                          idx,
                          "unit_price",
                          Number(e.target.value) || 0,
                        )
                      }
                      className="w-28"
                      placeholder="Price"
                    />
                    {items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(idx)}
                      >
                        <Trash2 className="size-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                >
                  <Plus className="mr-2 size-4" />
                  Add Item
                </Button>
              </div>

              <div className="border-t pt-3 text-right text-lg font-semibold">
                Total: {formatCurrency(total, DEFAULT_CURRENCY, {
                  alwaysShowDecimals: true,
                })}
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending ? "Creating..." : "Create Bill"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
