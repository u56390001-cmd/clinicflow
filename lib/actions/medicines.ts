"use server";

import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import {
  MEDICINE_IMPORT_MAX_ROWS,
  parseMedicinesCsv,
} from "@/lib/medicine-csv";
import { createClient } from "@/lib/supabase/server";
import { medicineFilterSchema, medicineSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/types";
import type { ClinicMedicine } from "@/types/database";

/**
 * Server actions for the clinic medicine catalogue — Organization settings →
 * Prescription → "Manage Medicines" (migration 0057).
 *
 * Reads are open to every clinic member, because the catalogue is offered on the
 * prescription screen a receptionist uses. Writes are owner/admin only, matching
 * `canWriteClinic` and the RLS policies in 0057, so the API cannot be used to
 * sidestep the UI's own guard.
 *
 * The list is paged in SQL rather than fetched whole. The markup shows "Page 1
 * of 17" over 250 rows; a clinic with a full formulary runs to thousands, and
 * counting them client-side would mean shipping the whole catalogue to render
 * fifteen lines of it.
 */

/** Rows per page. 15 × 17 = 255, which is what the markup's 250-row catalogue shows. */
const MEDICINES_PAGE_SIZE = 15;

/** What the Manage Medicines list renders — a view model, not a raw row. */
export type MedicineListItem = {
  id: string;
  name: string;
  strength: string;
  category: string;
  isActive: boolean;
};

export type MedicinesPage = {
  items: MedicineListItem[];
  total: number;
  totalActive: number;
  totalInactive: number;
  page: number;
  pageCount: number;
};

/** Map a catalogue row to the list view model. */
// function toListItem(row: ClinicMedicine): MedicineListItem {
//   return {
//     id: row.id,
//     name: row.name,
//     strength: row.strength ?? "",
//     category: row.category ?? "",
//     isActive: row.is_active,
//   };
// }

/**
 * Reduce a search term to something safe to interpolate into a PostgREST `.or()`
 * filter.
 *
 * `.or()` takes a raw filter string, so anything with a comma, a dot or a
 * parenthesis in it is filter syntax rather than a search term — and a
 * deliberately crafted term would let a user read or delete rows outside their
 * own query. Stripping to letters, digits and a few drug-name characters keeps
 * the search useful ("500mg", "paracetamol", "amox-clav") while making the
 * string incapable of being anything but a literal.
 */
function sanitiseSearchTerm(raw: string): string {
  return raw
    .replace(/[^a-z0-9\s.+\-()/]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Apply the search across name and strength.
 *
 * Strength is searched too because the catalogue splits it into its own column,
 * and the doctor who is looking for "500" should not have to know which drug
 * that is.
 *
 * The generic constraint is `{ or: … }` rather than a PostgREST builder type on
 * purpose: it is the one method called, it keeps the parameter type inferred
 * through the chain, and it does not re-state the client's whole generic
 * signature. The constraint also stops the function being handed a query it
 * would corrupt by appending a filter to.
 */
function applySearch<T extends { or: (filter: string) => T }>(
  query: T,
  term: string,
): T {
  const safe = sanitiseSearchTerm(term);
  if (safe === "") return query;
  const pattern = `%${safe}%`;
  return query.or(`name.ilike.${pattern},strength.ilike.${pattern}`);
}

/**
 * Load one page of the catalogue, plus the totals the toolbar needs.
 *
 * `page` is clamped rather than rejected: an out-of-range page can only be
 * reached by clicking Next past the end, and answering with the last populated
 * page is friendlier than an error for a request that is not really wrong.
 */
export async function getMedicinesAction(params?: {
  filter?: string;
  search?: string;
  page?: number;
}): Promise<ActionResult<MedicinesPage>> {
  const filter = medicineFilterSchema
    .catch("active")
    .parse(params?.filter ?? "active");
  const search = params?.search ?? "";

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You must have a clinic to manage medicines.",
    };
  }

  // Totals drive both the "N medicines in your clinic list" line and the filter
  // labels, and they must reflect the SEARCH but not the active filter —
  // otherwise switching to "Inactive only" would report zero inactive medicines.
  const countFor = async (isActive: boolean | null) => {
    const query = applySearch(
      supabase
        .from("medicines")
        .select("*", { count: "exact", head: true })
        .eq("clinic_id", access.clinic.id),
      search,
    );
    const { count, error } = await (isActive === null
      ? query
      : query.eq("is_active", isActive));
    if (error) {
      // PGRST205 is PostgREST saying `medicines` is not in its schema cache,
      // i.e. migration 0057 has not been applied (or the project needs a
      // reload). Worth logging distinctly because it is a deployment state, not
      // a user error.
      console.warn("[getMedicinesAction] medicines count failed", {
        clinicId: access.clinic.id,
        code: error.code,
        message: error.message,
      });
    }
    return count ?? 0;
  };

  const totalActiveCount = await countFor(true);
  const totalInactiveCount = await countFor(false);
  const filteredCount =
    filter === "all"
      ? totalActiveCount + totalInactiveCount
      : filter === "active"
        ? totalActiveCount
        : totalInactiveCount;

  const pageCount = Math.max(1, Math.ceil(filteredCount / MEDICINES_PAGE_SIZE));
  const page = Math.min(Math.max(1, params?.page ?? 1), pageCount);

  let listQuery = supabase
    .from("medicines")
    .select("id, name, strength, category, is_active, created_at")
    .eq("clinic_id", access.clinic.id);
  listQuery = applySearch(listQuery, search);
  if (filter !== "all") {
    listQuery = listQuery.eq("is_active", filter === "active");
  }

  const { data, error } = await listQuery
    .order("created_at", { ascending: false })
    .range((page - 1) * MEDICINES_PAGE_SIZE, page * MEDICINES_PAGE_SIZE - 1);

  if (error) {
    const notApplied = error.code === "PGRST205" || error.code === "42P01";
    console.warn("[getMedicinesAction] medicines query failed", {
      clinicId: access.clinic.id,
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      message: notApplied
        ? "The medicine list is not set up yet. Run the Prescription settings migration to enable it."
        : "We couldn't load your medicine list. Please try again.",
    };
  }

  return {
    ok: true,
    data: {
      items: (
        (data ?? []) as Array<
          Pick<
            ClinicMedicine,
            "id" | "name" | "strength" | "category" | "is_active" | "created_at"
          >
        >
      ).map((row) => ({
        id: row.id,
        name: row.name,
        strength: row.strength ?? "",
        category: row.category ?? "",
        isActive: row.is_active,
      })),
      total: filteredCount,
      totalActive: totalActiveCount,
      totalInactive: totalInactiveCount,
      page,
      pageCount,
    },
  };
}

/**
 * Shared tail of every mutation: resolve the clinic, reject non-writers.
 *
 * Returns the client so callers can go straight on to their query — the guard
 * and the write are always the same two steps in this file, and splitting them
 * is how one of them ends up missing.
 */
async function requireWriteAccess(): Promise<
  | {
      ok: false;
      message: string;
    }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      clinicId: string;
      userId: string | null;
    }
> {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return {
      ok: false,
      message: "You must have a clinic to manage medicines.",
    };
  }
  if (!canWriteClinic(access.role)) {
    return {
      ok: false,
      message: "Only owners and admins can manage the medicine list.",
    };
  }

  const { data } = await supabase.auth.getUser();
  return {
    ok: true,
    supabase,
    clinicId: access.clinic.id,
    userId: data.user?.id ?? null,
  };
}

/** Turn a Zod failure into the `{ message, fieldErrors }` shape the forms read. */
function validationFailure(parsed: {
  success: false;
  error: { issues: { path: PropertyKey[]; message: string }[] };
}): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return {
    ok: false,
    message:
      parsed.error.issues[0]?.message ?? "Check the medicine and try again.",
    fieldErrors,
  };
}

/**
 * Human wording for the unique-index violation on
 * `medicines_clinic_name_strength_unique`.
 *
 * This fires whenever a member adds a drug the clinic already has, which is a
 * normal thing to attempt, so it gets its own message rather than the generic
 * failure. The index is on lower(name) + lower(strength), so the message names
 * the strength too — "already in your list" alone would be confusing when the
 * existing row is a different strength of the same drug.
 */
function duplicateMessage(error: { code: string; details?: string }): string {
  if (error.code !== "23505")
    return "We couldn't save that medicine. Please try again.";
  const existing = error.details?.match(/strength=\(([^)]*)\)/)?.[1];
  if (existing) {
    return `That medicine is already in your list at strength ${existing.replace(/^NULL$/i, "").trim() || "(no strength)"}.`;
  }
  return "That medicine is already in your list.";
}

/** Read a checkbox-style boolean form field, tolerating an unsubmitted control. */
function booleanFormValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "false";
}

/** Add one medicine to the clinic catalogue. */
export async function createMedicineAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = medicineSchema.safeParse({
    name: formData.get("name"),
    strength: formData.get("strength"),
    category: formData.get("category"),
    isActive: booleanFormValue(formData, "isActive"),
  });
  if (!parsed.success) return validationFailure(parsed);

  const guard = await requireWriteAccess();
  if (!guard.ok) return { ok: false, message: guard.message };

  const { error } = await guard.supabase.from("medicines").insert({
    clinic_id: guard.clinicId,
    name: parsed.data.name,
    strength: parsed.data.strength || null,
    category: parsed.data.category || null,
    is_active: parsed.data.isActive,
    created_by_user_id: guard.userId,
  });

  if (error) {
    console.error("[createMedicineAction] medicines insert failed", {
      clinicId: guard.clinicId,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: duplicateMessage(error) };
  }

  return { ok: true, data: undefined };
}

/**
 * Edit a catalogue entry, including flipping it back to active.
 *
 * The row is matched on `clinic_id` as well as `id`, so a stale id from another
 * clinic updates nothing rather than someone else's medicine. RLS would block it
 * too; matching on both means the failure is a zero-row update rather than an
 * error, which is the honest outcome.
 */
export async function updateMedicineAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") {
    return { ok: false, message: "We couldn't tell which medicine to update." };
  }

  const parsed = medicineSchema.safeParse({
    name: formData.get("name"),
    strength: formData.get("strength"),
    category: formData.get("category"),
    isActive: booleanFormValue(formData, "isActive"),
  });
  if (!parsed.success) return validationFailure(parsed);

  const guard = await requireWriteAccess();
  if (!guard.ok) return { ok: false, message: guard.message };

  const { error } = await guard.supabase
    .from("medicines")
    .update({
      name: parsed.data.name,
      strength: parsed.data.strength || null,
      category: parsed.data.category || null,
      is_active: parsed.data.isActive,
    })
    .eq("id", id)
    .eq("clinic_id", guard.clinicId);

  if (error) {
    console.error("[updateMedicineAction] medicines update failed", {
      clinicId: guard.clinicId,
      medicineId: id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: duplicateMessage(error) };
  }

  return { ok: true, data: undefined };
}

/**
 * Deactivate or reactivate one medicine.
 *
 * A soft flag rather than a delete, so a drug that appears on a prescription
 * already issued keeps the exact name it was printed with. Called directly from
 * the list rather than through `useActionState`, matching `removeMemberAction` in
 * the team manager — there is no form state to reconcile for a one-button row.
 */
export async function setMedicineActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const guard = await requireWriteAccess();
  if (!guard.ok) return { ok: false, message: guard.message };

  const { error } = await guard.supabase
    .from("medicines")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("clinic_id", guard.clinicId);

  if (error) {
    console.error("[setMedicineActiveAction] medicines update failed", {
      clinicId: guard.clinicId,
      medicineId: id,
      code: error.code,
      message: error.message,
    });
    return { ok: false, message: "We couldn't update that medicine." };
  }

  return { ok: true, data: undefined };
}

/** Result of an import, reported row-count honestly rather than as a bare "done". */
export type ImportSummary = {
  added: number;
  /** Already present in the clinic's list, matched on name + strength. */
  duplicates: number;
  /** Rows the parser could not read, with the line and the reason. */
  skipped: { line: number; reason: string }[];
};

/**
 * Import a catalogue file.
 *
 * Duplicates are filtered out before the insert rather than left to the unique
 * index, because an index violation aborts the WHOLE statement — one
 * already-present drug in the file would silently roll back the other 200. The
 * pre-filter lets the import land what is genuinely new and report the rest.
 *
 * The index is still the authority: two admins importing at once can race, and
 * the 23505 catch turns that race into a reported duplicate count rather than a
 * failed import.
 */
export async function importMedicinesAction(
  // Typed as the action's OWN result shape rather than bare `ActionResult`, so
  // `useActionState<ActionResult<ImportSummary> | null, FormData>` accepts this
  // function directly. It hands the previous state back in, and under
  // strictFunctionTypes an `ActionResult<ImportSummary>` is not an
  // `ActionResult<undefined>` — the mismatch the caller was casting away.
  _prevState: ActionResult<ImportSummary> | null,
  formData: FormData,
): Promise<ActionResult<ImportSummary>> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file to import." };
  }
  // A spreadsheet of a few thousand drug names is well under this; the cap stops
  // a mistakenly dropped 200 MB file from being read into memory at all.
  if (file.size > 5 * 1024 * 1024) {
    return {
      ok: false,
      message: "That file is too large. Keep it under 5 MB.",
    };
  }
  const isCsv =
    file.type === "text/csv" ||
    file.name.toLowerCase().endsWith(".csv") ||
    file.name.toLowerCase().endsWith(".tsv");
  if (!isCsv) {
    return {
      ok: false,
      message:
        "Only CSV files can be imported. Open the file in Excel and choose 'Save as' → CSV.",
    };
  }

  const guard = await requireWriteAccess();
  if (!guard.ok) return { ok: false, message: guard.message };

  const parsed = parseMedicinesCsv(await file.text(), MEDICINE_IMPORT_MAX_ROWS);
  if (parsed.noHeader) {
    return {
      ok: false,
      message:
        "We couldn't find a medicine name column. The header row needs at least a Name or Medicine column.",
    };
  }
  if (parsed.rows.length === 0) {
    return {
      ok: false,
      message:
        parsed.skipped.length > 0
          ? "No medicine rows could be read from that file."
          : "That file has no medicine rows.",
    };
  }

  // Existing names, normalised the same way the unique index normalises them, so
  // "Panadol" and "panadol " count as one.
  const { data: existing, error: readError } = await guard.supabase
    .from("medicines")
    .select("name, strength")
    .eq("clinic_id", guard.clinicId);

  if (readError) {
    console.error("[importMedicinesAction] could not read existing medicines", {
      clinicId: guard.clinicId,
      code: readError.code,
      message: readError.message,
    });
    return { ok: false, message: "We couldn't read your medicine list." };
  }

  const key = (name: string, strength: string | null) =>
    `${name.trim().toLowerCase()}::${(strength ?? "").trim().toLowerCase()}`;

  const seen = new Set(
    ((existing ?? []) as Array<{ name: string; strength: string | null }>).map(
      (row) => key(row.name, row.strength),
    ),
  );

  const toInsert: Array<{
    clinic_id: string;
    name: string;
    strength: string | null;
    category: string | null;
    is_active: boolean;
    created_by_user_id: string | null;
  }> = [];

  let duplicates = 0;
  for (const row of parsed.rows) {
    const rowKey = key(row.name, row.strength);
    // The in-file `seen` set also collapses a file that lists the same drug
    // twice, which the pre-filter would otherwise send as one insert that trips
    // the index on its own second row.
    if (seen.has(rowKey)) {
      duplicates++;
      continue;
    }
    seen.add(rowKey);
    toInsert.push({
      clinic_id: guard.clinicId,
      name: row.name,
      strength: row.strength || null,
      category: row.category || null,
      is_active: row.isActive,
      created_by_user_id: guard.userId,
    });
  }

  if (toInsert.length > 0) {
    const { error } = await guard.supabase.from("medicines").insert(toInsert);
    if (error) {
      console.error("[importMedicinesAction] medicines insert failed", {
        clinicId: guard.clinicId,
        code: error.code,
        message: error.message,
        attempted: toInsert.length,
      });
      if (error.code === "23505") {
        // Lost a race with a concurrent import. Nothing landed, so the caller is
        // told to retry rather than told a partial success.
        return {
          ok: false,
          message:
            "Someone added to the medicine list while you were importing. Please try again.",
        };
      }
      return {
        ok: false,
        message: "We couldn't import that file. Please try again.",
      };
    }
  }

  return {
    ok: true,
    data: { added: toInsert.length, duplicates, skipped: parsed.skipped },
  };
}
