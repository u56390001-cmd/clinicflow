/**
 * scripts/time-check.ts
 *
 * Timezone conversion regression test.
 *
 * `clinicLocalToUtcIso` used to subtract the clinic's UTC offset TWICE, which
 * shifted every stored appointment by one full offset (5 hours for
 * Asia/Karachi) and made the slot-availability check run against the wrong
 * clock. `date-fns-tz` (already a dependency) is used as the oracle.
 *
 *   npx tsx scripts/time-check.ts
 */
import { fromZonedTime } from "date-fns-tz";

import {
  clinicLocalToUtcIso,
  utcIsoToClinicLocalInput,
} from "@/lib/time";

const ZONES = [
  "UTC",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** Local wall-clock samples, including DST edges and midnight. */
const SAMPLES = [
  "2026-01-15T00:00",
  "2026-01-15T09:00",
  "2026-01-15T12:30",
  "2026-03-08T03:30",
  "2026-03-29T01:30",
  "2026-04-05T02:30",
  "2026-06-15T09:00",
  "2026-07-01T14:45",
  "2026-09-27T02:30",
  "2026-10-20T15:30",
  "2026-10-23T09:00",
  "2026-11-01T05:30",
  "2026-12-31T23:45",
];

let checked = 0;
const failures: string[] = [];

for (const tz of ZONES) {
  for (const naive of SAMPLES) {
    checked++;
    const truth = fromZonedTime(naive, tz).toISOString();
    const ours = clinicLocalToUtcIso(naive, tz);
    if (truth !== ours) {
      failures.push(`${naive} ${tz}: expected ${truth}, got ${ours}`);
      continue;
    }
    // The round trip must behave exactly like the oracle. A wall clock inside
    // a DST "hole" does not exist locally, so it cannot round trip to itself
    // — the oracle shifts it too, and we must shift it the same way.
    const oursBack = utcIsoToClinicLocalInput(ours, tz);
    const truthBack = utcIsoToClinicLocalInput(truth, tz);
    if (oursBack !== truthBack) {
      failures.push(
        `${naive} ${tz}: round trip returned ${oursBack}, oracle returned ${truthBack}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("FAILURES:");
  for (const f of failures) console.error("  " + f);
  console.error(`\n${failures.length}/${checked} conversions wrong`);
  process.exit(1);
}

console.log(`[PASS] ${checked}/${checked} local<->UTC conversions match date-fns-tz`);
