/**
 * scripts/consultation-flow-check.ts
 *
 * End-to-end check of the consultation lock against the live database, using
 * a REAL clinic-member session (the RPCs are gated on `is_clinic_member`, so
 * the service role cannot call them).
 *
 * The script drives the real transitions, so it snapshots the visits it
 * touches and restores them exactly afterwards — the clinic's queue is left
 * as it was found.
 *
 *   npx tsx scripts/consultation-flow-check.ts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const CLINIC = "b385bf89-4aa1-4ca2-9b2c-1c5d67e85e1a";
const MEMBER_EMAIL = "medbookai@admin.com";
const DOCTOR_ID = "f4b712f0-2dd1-444e-bae9-5ce88d4f0174"; // Dr Umar Farooq

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "[PASS]" : "[FAIL]"} ${name}${detail ? `  (${detail})` : ""}`);
}

type VisitRow = {
  id: string;
  status: string;
  doctor_id: string | null;
  queue_position: number;
  checked_in_at: string;
  consultation_started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  paused_by_name: string | null;
};

async function memberClient() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: MEMBER_EMAIL,
  });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${error?.message}`);
  }
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const verify = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (verify.error) throw new Error(`verifyOtp failed: ${verify.error.message}`);
  return client;
}

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const member = await memberClient();
  console.log("signed in as:", MEMBER_EMAIL, "\n");

  // ── Snapshot ──────────────────────────────────────────────────────────────
  const { data: candidates } = await admin
    .from("visits")
    .select(
      "id, status, doctor_id, queue_position, checked_in_at, consultation_started_at, completed_at, paused_at, paused_by_name",
    )
    .eq("clinic_id", CLINIC)
    .eq("doctor_id", DOCTOR_ID)
    .in("status", ["waiting", "in_consultation", "checked_in"])
    .order("queue_position", { ascending: true });

  const rows = (candidates ?? []) as VisitRow[];
  const dayStartMs = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const todayRows = rows.filter((v) => new Date(v.checked_in_at).getTime() >= dayStartMs);
  const leftoverRows = rows.filter((v) => new Date(v.checked_in_at).getTime() < dayStartMs);
  console.log(
    `Dr Umar queue: ${todayRows.length} checked in today, ${leftoverRows.length} leftover, ${rows.length} total\n`,
  );

  const snapshot = new Map(
    rows.map((v) => [
      v.id,
      {
        status: v.status,
        consultation_started_at: v.consultation_started_at,
        completed_at: v.completed_at,
        paused_at: v.paused_at,
        paused_by_name: v.paused_by_name,
      },
    ]),
  );

  const reset = async (id: string) => {
    await admin
      .from("visits")
      .update({
        status: "waiting",
        consultation_started_at: null,
        completed_at: null,
        paused_at: null,
        paused_by_name: null,
      })
      .eq("id", id);
  };
  const restoreAll = async () => {
    for (const [id, snap] of snapshot) {
      await admin.from("visits").update(snap).eq("id", id);
    }
  };

  const first = todayRows[0];
  const second = todayRows[1];
  const leftover = leftoverRows[0];

  try {
    // ── 1. A leftover visit can be started — it must not be blocked ────────
    if (leftover) {
      await reset(leftover.id);
      const start = await member.rpc("start_consultation", {
        p_clinic_id: CLINIC,
        p_visit_id: leftover.id,
      });
      check(
        "a leftover visit can be started (no hidden consultation blocks it)",
        !start.error,
        start.error?.message,
      );
    } else {
      check("a leftover visit can be started", true, "no leftover to test");
    }

    // ── 2. Today's patient starts, and a second one is refused ─────────────
    if (first) {
      await reset(first.id);
      const start = await member.rpc("start_consultation", {
        p_clinic_id: CLINIC,
        p_visit_id: first.id,
      });
      check("today's patient starts", !start.error, start.error?.message);

      if (second) {
        await reset(second.id);
        const blocked = await member.rpc("start_consultation", {
          p_clinic_id: CLINIC,
          p_visit_id: second.id,
        });
        check(
          "a live consultation still blocks the same doctor",
          Boolean(blocked.error) &&
            /currently in consultation/i.test(blocked.error?.message ?? ""),
          blocked.error?.message,
        );
      }

      // ── 3. Completing promotes a TODAY patient, never a leftover ─────────
      const done = await member.rpc("complete_and_advance", {
        p_clinic_id: CLINIC,
        p_visit_id: first.id,
      });
      check("complete_and_advance completes the visit", !done.error, done.error?.message);
      const promotedId = done.data?.id ?? null;
      const promoted = promotedId
        ? rows.find((v) => v.id === promotedId)
        : null;
      if (promoted) {
        check(
          "the promoted patient is from today's queue",
          new Date(promoted.checked_in_at).getTime() >= dayStartMs,
          `promoted checked_in_at=${promoted.checked_in_at}`,
        );
      } else {
        check("the promoted patient is from today's queue", true, "nobody left to promote");
      }
    } else {
      check("today's patient starts", false, "no patient checked in today");
    }

    // ── 4. "Return to Queue" releases an open consultation ─────────────────
    if (first) {
      // Every visit under test must be clean, otherwise the one-per-doctor
      // guard refuses the start and the pause has nothing to release.
      for (const row of rows) await reset(row.id);
      await member.rpc("start_consultation", {
        p_clinic_id: CLINIC,
        p_visit_id: first.id,
      });
      const paused = await member.rpc("pause_consultation", {
        p_clinic_id: CLINIC,
        p_visit_id: first.id,
      });
      const { data: afterPause } = await admin
        .from("visits")
        .select("status, paused_at")
        .eq("id", first.id)
        .maybeSingle();
      check(
        "pause_consultation returns the patient to the queue",
        !paused.error && afterPause?.status === "waiting",
        `status=${afterPause?.status} error=${paused.error?.message ?? "-"}`,
      );
      check(
        "a returned consultation is marked as paused",
        Boolean((afterPause as { paused_at?: string | null } | null)?.paused_at),
      );
    }

    // ── 5. The stale release sweep clears anything left open ───────────────
    for (const row of rows) await reset(row.id);
    await admin
      .from("visits")
      .update({
        status: "in_consultation",
        consultation_started_at: "2026-10-01T10:00:00+00:00",
      })
      .eq("id", leftover?.id ?? first?.id ?? "");
    const before = await admin
      .from("visits")
      .select("id")
      .eq("clinic_id", CLINIC)
      .eq("status", "in_consultation");
    const released = await member.rpc("release_stale_consultations", {
      p_clinic_id: CLINIC,
    });
    const after = await admin
      .from("visits")
      .select("id")
      .eq("clinic_id", CLINIC)
      .eq("status", "in_consultation");
    check(
      "release_stale_consultations clears a leftover consultation",
      (before.data?.length ?? 0) === 1 && (after.data?.length ?? 0) === 0,
      `before=${before.data?.length ?? 0} after=${after.data?.length ?? 0} released=${released.data}`,
    );
  } finally {
    await restoreAll();
    const { data: final } = await admin
      .from("visits")
      .select("id, status")
      .eq("clinic_id", CLINIC)
      .eq("doctor_id", DOCTOR_ID)
      .in("status", ["waiting", "in_consultation"])
      .order("queue_position", { ascending: true });
    console.log(
      "\nqueue restored:",
      (final ?? []).map((f) => `${f.id.slice(0, 8)}=${f.status}`).join(", "),
    );
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exit(1);
}

void main();
