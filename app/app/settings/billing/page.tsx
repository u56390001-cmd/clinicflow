import { redirect } from "next/navigation";

import { BillingSettingsCards } from "@/components/settings/billing-settings-cards";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Read the billing settings block in isolation.
 *
 * Same rule as the Patient ID and logo pages: `clinics` gains columns in
 * migrations that may not be applied yet (0056 here), and a column that does not
 * exist makes PostgREST reject the whole select. Putting the new columns into
 * the shared `getCurrentClinic` select would break every authenticated page, not
 * just this tab — so they are read here, and a failure degrades to the
 * column defaults the migration itself uses.
 */
async function readBillingSettings(clinicId: string) {
  const defaults = {
    bill_number_prefix: "BILL",
    receipt_prefix: "RCP",
    auto_send_whatsapp_receipt: false,
    receipt_footer_message: null,
    show_gst_on_receipt: false,
    gst_number: null,
    gst_rate: null,
    bill_terms: null,
  } as const;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clinics")
    .select(
      "bill_number_prefix, receipt_prefix, auto_send_whatsapp_receipt, receipt_footer_message, show_gst_on_receipt, gst_number, gst_rate, bill_terms",
    )
    .eq("id", clinicId)
    .maybeSingle();

  if (error) {
    console.warn("[billing-settings] could not read clinics billing columns", {
      code: error.code,
      message: error.message,
    });
    return { ...defaults };
  }

  return { ...defaults, ...((data ?? {}) as Partial<typeof defaults>) };
}

/**
 * Organization settings → Billing.
 *
 * Previews come from `preview_bill_number` / `preview_receipt_code` (0056), which
 * share their LIKE patterns with the numbering triggers, so the code shown on
 * this screen is the code the database will actually produce.
 */
export default async function BillingSettingsPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) redirect("/app");

  const settings = await readBillingSettings(access.clinic.id);

  // Both calls are independent, and both are allowed to fail: the card falls
  // back to a locally formatted sample rather than blocking the page.
  const [bill, receipt] = await Promise.all([
    supabase.rpc("preview_bill_number", {
      p_clinic_id: access.clinic.id,
      p_prefix: settings.bill_number_prefix,
    }),
    supabase.rpc("preview_receipt_code", {
      p_clinic_id: access.clinic.id,
      p_prefix: settings.receipt_prefix,
    }),
  ]);

  if (bill.error || receipt.error) {
    console.warn("[billing-settings] preview RPC unavailable", {
      bill: bill.error?.code,
      receipt: receipt.error?.code,
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <BillingSettingsCards
        initial={{
          billNumberPrefix: settings.bill_number_prefix,
          receiptPrefix: settings.receipt_prefix,
          autoSendWhatsappReceipt: settings.auto_send_whatsapp_receipt,
          receiptFooterMessage: settings.receipt_footer_message ?? "",
          showGstOnReceipt: settings.show_gst_on_receipt,
          gstNumber: settings.gst_number ?? "",
          gstRate: settings.gst_rate === null ? "" : String(settings.gst_rate),
          billTerms: settings.bill_terms ?? "",
        }}
        previews={{
          bill: bill.data ?? "",
          receipt: receipt.data ?? "",
        }}
        canWrite={canWriteClinic(access.role)}
      />
    </div>
  );
}

export type BillingSettingsDb = Database["public"]["Tables"]["clinics"]["Row"];
