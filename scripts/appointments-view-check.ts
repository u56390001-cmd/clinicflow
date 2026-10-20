/**
 * scripts/appointments-view-check.ts
 *
 * Verifies the Appointments tab filtering against the live database using the
 * REAL query helpers, so "Today" / "Upcoming" can be checked against the same
 * code the page renders with.
 *
 *   npx tsx scripts/appointments-view-check.ts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { fetchAllAppointments, fetchTodayQueue } from "@/lib/visits-queries";
import { utcIsoToClinicLocalInput } from "@/lib/time";

const env: Record<string, string> = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const CLINIC = "b385bf89-4aa1-4ca2-9b2c-1c5d67e85e1a";
const TZ = "Asia/Karachi";

function rowStatusMeta(row: { status: string; visit: { status: string } | null }) {
  if (row.status === "cancelled" || row.status === "no_show") return row.status;
  const visitStatus = row.visit?.status;
  if (visitStatus && visitStatus !== "scheduled") return visitStatus;
  return row.status;
}

async function main() {
  const nowMs = Date.now();
  console.log("now (clinic local):", utcIsoToClinicLocalInput(new Date().toISOString(), TZ));

  const today = await fetchTodayQueue(supabase, CLINIC, TZ);
  console.log(`\n=== Today tab (${today.length}) ===`);
  for (const a of today) {
    console.log(
      `  ${utcIsoToClinicLocalInput(a.start_time, TZ)}  ${a.patientName.padEnd(12)} appt=${a.status.padEnd(9)} live=${rowStatusMeta(a)}`,
    );
  }

  const all = await fetchAllAppointments(supabase, CLINIC);
  const upcoming = all
    .filter(
      (a) =>
        (a.status === "pending" || a.status === "confirmed") &&
        new Date(a.start_time).getTime() >= nowMs,
    )
    .sort((x, y) => x.start_time.localeCompare(y.start_time));

  console.log(`\n=== Upcoming tab (${upcoming.length}) ===`);
  for (const a of upcoming) {
    console.log(
      `  ${utcIsoToClinicLocalInput(a.start_time, TZ)}  ${a.patientName.padEnd(12)} appt=${a.status.padEnd(9)} live=${rowStatusMeta(a)}  token=${a.visit?.token_number ?? "-"}`,
    );
  }

  const elapsed = all.filter(
    (a) =>
      (a.status === "pending" || a.status === "confirmed") &&
      new Date(a.start_time).getTime() < nowMs,
  );
  console.log(`\n=== elapsed (no longer upcoming) (${elapsed.length}) ===`);
  for (const a of elapsed) {
    console.log(
      `  ${utcIsoToClinicLocalInput(a.start_time, TZ)}  ${a.patientName.padEnd(12)} live=${rowStatusMeta(a)}  token=${a.visit?.token_number ?? "-"}`,
    );
  }
}
void main();
