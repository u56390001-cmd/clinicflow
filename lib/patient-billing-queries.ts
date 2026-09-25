import { createClient } from "@/lib/supabase/server";
import type {
  PatientBill,
  PatientBillItem,
  PatientPayment,
  Receipt,
  Service,
  Visit,
} from "@/types/database";

/**
 * Embeds are written with the explicit `!constraint_name` hint rather than bare
 * `patients(...)`.
 *
 * `patient_bills` has four foreign keys and every one of them includes
 * `clinic_id` (to clinics, patients, visits and doctors). PostgREST resolves a
 * bare embed by searching pg_constraint, and with a column shared across four
 * keys the match is not reliably unambiguous. Naming the constraint removes the
 * guesswork — the same reason `lib/consultation-queries.ts` writes
 * `patients!visits_clinic_patient_fkey`.
 *
 * All four constraints exist as of `0030`. Before that, `patient_bills` had no
 * FK to `patients` or `visits` at all and these embeds failed with PGRST200.
 */

/**
 * The number of bills the transactions table loads. The filter pills (Today /
 * All Bills / Pending) narrow client-side, so "All Bills" is bounded by this,
 * not by the clinic's history. A clinic past the cap sees the most recent 500
 * and a note saying so — `PatientBillList.truncated` carries that fact to the
 * UI rather than letting the list quietly look complete.
 */
export const BILL_LIST_LIMIT = 500;

/**
 * One row of the billing transactions table.
 *
 * Items, payments and receipts come back in full rather than as counts because
 * the row's Eye and Printer actions open `billing-sheet.tsx` and
 * `receipt-preview.tsx`, both of which need the itemised lines. Fetching those
 * on click would be a round trip per row opened; a clinic's bill rows are small
 * and this is one query.
 *
 * `visits` and `doctors` are single objects or null — the FK is on this side, so
 * the embed is many-to-one. Manual bills have `visit_id = null` and therefore no
 * token and no check-in time, which is why TIME has to tolerate absence rather
 * than assume it.
 */
export type PatientBillListRow = PatientBill & {
  patients: { name: string; phone: string | null; email: string | null } | null;
  patient_bill_items: PatientBillItem[];
  patient_payments: PatientPayment[];
  receipts: Receipt[];
  visits: { token_number: number; checked_in_at: string } | null;
  doctors: {
    name: string;
    qualification: string | null;
    signature_url: string | null;
  } | null;
};

export type PatientBillList = {
  bills: PatientBillListRow[];
  /** True when the clinic has more bills than `BILL_LIST_LIMIT`. */
  truncated: boolean;
};

/**
 * Fetch patient bills for the transactions table, newest first.
 *
 * Ordered by `created_at` rather than `bill_date`: two bills raised on the same
 * day must have a stable order, and `bill_date` is a date with no time in it.
 */
export async function fetchPatientBills(
  clinicId: string,
): Promise<PatientBillList> {
  const supabase = await createClient();

  const { data: bills, error } = await supabase
    .from("patient_bills")
    .select(`
      *,
      patients!patient_bills_clinic_patient_fkey ( name, phone, email ),
      patient_bill_items ( * ),
      patient_payments ( * ),
      receipts ( * ),
      visits!patient_bills_clinic_visit_fkey ( token_number, checked_in_at ),
      doctors!patient_bills_clinic_doctor_fkey ( name, qualification, signature_url )
    `)
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    // One over the cap, so a full page tells us whether more exist without a
    // second count query.
    .limit(BILL_LIST_LIMIT + 1);

  if (error) throw error;

  const rows = (bills ?? []) as unknown as PatientBillListRow[];
  const truncated = rows.length > BILL_LIST_LIMIT;

  return {
    bills: truncated ? rows.slice(0, BILL_LIST_LIMIT) : rows,
    truncated,
  };
}

/**
 * Fetch a single bill with all its items, payments, and receipt.
 */
export async function fetchBillDetails(clinicId: string, billId: string) {
  const supabase = await createClient();

  const { data: bill, error } = await supabase
    .from("patient_bills")
    .select(`
      *,
      patients!patient_bills_clinic_patient_fkey ( name, phone, email ),
      patient_bill_items ( * ),
      patient_payments ( * ),
      receipts ( * )
    `)
    .eq("clinic_id", clinicId)
    .eq("id", billId)
    .single();

  if (error) throw error;

  return bill as unknown as PatientBill & {
    patients: { name: string; phone: string | null; email: string | null } | null;
    patient_bill_items: PatientBillItem[];
    patient_payments: PatientPayment[];
    receipts: Receipt[];
  };
}

/**
 * Fetch active services for pre-filling bill line items.
 */
export async function fetchActiveServices(clinicId: string) {
  const supabase = await createClient();

  const { data: services, error } = await supabase
    .from("services")
    .select("id, name, price, description")
    .eq("clinic_id", clinicId)
    .eq("status", "active")
    .order("name");

  if (error) throw error;

  return (services ?? []) as Pick<Service, "id" | "name" | "price" | "description">[];
}

/**
 * Fetch pending visits (for the billing dashboard "Collect Payment" action).
 */
export async function fetchPendingVisits(clinicId: string) {
  const supabase = await createClient();

  const { data: visits, error } = await supabase
    .from("visits")
    .select(`
      *,
      patients!visits_clinic_patient_fkey ( name, phone ),
      appointments!visits_clinic_appointment_fkey ( id ),
      doctors!visits_clinic_doctor_fkey ( name )
    `)
    .eq("clinic_id", clinicId)
    .eq("payment_status", "pending")
    .in("status", ["waiting", "in_consultation", "completed"])
    .order("queue_position");

  if (error) throw error;

  return (visits ?? []) as unknown as (Visit & {
    patients: { name: string; phone: string | null } | null;
    appointments: { id: string } | null;
    doctors: { name: string } | null;
  })[];
}
