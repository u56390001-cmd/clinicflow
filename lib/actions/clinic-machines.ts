"use server";

import { z } from "zod";

import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";
import type { ClinicMachine } from "@/types/database";

type Guard =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      clinicId: string;
    }
  | { ok: false; result: ActionResult<never> };

/**
 * Admin gate for machine registry writes. `canWriteClinic` is exactly the
 * owner/admin/clinic_admin set `is_clinic_admin` RLS enforces on the table,
 * so the UI guard, the action guard and the database policy cannot disagree.
 */
async function adminGuard(): Promise<Guard> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      result: { ok: false, message: "You must have a clinic to do this." },
    };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      result: {
        ok: false,
        message: "Only clinic administrators can manage machines.",
      },
    };
  }
  return { ok: true, supabase, clinicId: access.clinic.id };
}

const parameterField = z.object({
  key: z.string().trim().max(64).optional().or(z.literal("")),
  label: z
    .string()
    .trim()
    .min(1, "Give the parameter a name.")
    .max(80, "Parameter name is too long."),
  placeholder: z.string().trim().max(80).optional().or(z.literal("")),
});

const machineInput = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z
    .string()
    .trim()
    .min(1, "Enter the machine name.")
    .max(120, "Machine name is too long."),
  brand_model: z.string().trim().max(160).optional().or(z.literal("")),
  category: z.string().trim().max(80).optional().or(z.literal("")),
  is_active: z.boolean().optional(),
  parameter_fields: z.array(parameterField).max(30).optional(),
});

export type ClinicMachineSaveInput = z.infer<typeof machineInput>;

/**
 * Derive a stable `key` for every parameter field from its label (the UI
 * collects labels; keys are what procedure `params` values are stored
 * against, so they are normalised once, here, deduped across the set).
 */
function deriveKeys(
  fields: z.infer<typeof parameterField>[],
): { key: string; label: string; placeholder: string }[] {
  const used = new Set<string>();
  return fields.map((field, index) => {
    const base =
      field.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || `field_${index + 1}`;
    let key = base;
    let suffix = 2;
    while (used.has(key)) {
      key = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(key);
    return { key, label: field.label, placeholder: field.placeholder ?? "" };
  });
}

/** Create or update a machine in the signed-in user's clinic registry. */
export async function saveClinicMachineAction(
  raw: unknown,
): Promise<ActionResult<ClinicMachine>> {
  const guard = await adminGuard();
  if (!guard.ok) return guard.result;

  const parsed = machineInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid machine details.",
    };
  }

  const row = {
    name: parsed.data.name,
    brand_model: parsed.data.brand_model || null,
    category: parsed.data.category || null,
    is_active: parsed.data.is_active ?? true,
    parameter_fields: deriveKeys(parsed.data.parameter_fields ?? []),
  };

  const query = parsed.data.id
    ? guard.supabase
        .from("clinic_machines")
        .update(row)
        .eq("id", parsed.data.id)
        .eq("clinic_id", guard.clinicId)
        .select("*")
        .single()
    : guard.supabase
        .from("clinic_machines")
        .insert({ ...row, clinic_id: guard.clinicId })
        .select("*")
        .single();

  const { data, error } = await query;
  if (error) {
    console.error("[saveClinicMachineAction] clinic_machines write failed", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "Could not save the machine." };
  }

  return { ok: true, data };
}

/**
 * Remove a machine from the registry. Procedure history is untouched: values
 * recorded against the machine were snapshotted into
 * `derm_procedures.params` at save time.
 */
export async function deleteClinicMachineAction(
  id: string,
): Promise<ActionResult<string>> {
  const guard = await adminGuard();
  if (!guard.ok) return guard.result;
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, message: "Invalid machine." };
  }

  const { error } = await guard.supabase
    .from("clinic_machines")
    .delete()
    .eq("id", id)
    .eq("clinic_id", guard.clinicId);

  if (error) {
    console.error("[deleteClinicMachineAction] clinic_machines delete failed", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "Could not remove the machine." };
  }

  return { ok: true, data: "Removed" };
}
