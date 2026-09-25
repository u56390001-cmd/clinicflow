import { redirect } from "next/navigation";

import { getCurrentClinic, canManageClinical } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { fetchPatientBills, fetchActiveServices } from "@/lib/patient-billing-queries";
import { BillsTable } from "@/components/patient-billing/bills-table";
import { clinicToday } from "@/lib/time";

export default async function PatientBillingPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) redirect("/app/dashboard");
  if (!canManageClinical(access.role)) redirect("/app/dashboard");

  const [billsResult, services] = await Promise.all([
    fetchPatientBills(access.clinic.id),
    fetchActiveServices(access.clinic.id),
  ]);

  return (
    <BillsTable
      bills={billsResult.bills}
      truncated={billsResult.truncated}
      timezone={access.clinic.timezone}
      today={clinicToday(access.clinic.timezone)}
      services={services.map((s) => ({ id: s.id, name: s.name, price: s.price }))}
      clinic={{
        name: access.clinic.name,
        address: access.clinic.address,
        phone: access.clinic.phone,
      }}
    />
  );
}
