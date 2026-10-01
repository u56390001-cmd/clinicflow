"use client";

import { useEffect, useState } from "react";

import { getDoctorVitalsConfigAction } from "@/lib/actions/doctors";
import type { DoctorVitalsConfigMap } from "@/lib/vitals-config";
import type { DoctorVitalsConfig } from "@/types/database";

export type DoctorVitalsConfigState =
  | { status: "loading"; config: null }
  | { status: "ready"; config: DoctorVitalsConfig | null }
  | { status: "error"; config: null };

/**
 * Resolve the vitals config for the doctor currently attached to a visit /
 * appointment. `null` config (ready) means the doctor has no custom config —
 * capture every standard vital. `undefined` doctor id converges to ready/null.
 *
 * Pass `preloaded` (the page's server-fetched map) when available: a hit
 * starts in the `ready` state on first paint, so the Add Vitals popup never
 * shows a skeleton or re-flows its field grid after opening. The preloaded
 * value is only a first-paint optimization — the effect ALWAYS refetches the
 * doctor's config on the background and converges to the latest row. This
 * makes a config edit (e.g. the doctor re-enabling blood pressure) take
 * effect immediately even when this page was rendered with a stale cached
 * map (see next.config staleTimes).
 */
export function useDoctorVitalsConfig(
  doctorId: string | null | undefined,
  preloaded?: DoctorVitalsConfigMap | null,
): DoctorVitalsConfigState {
  const preloadedEntry =
    doctorId && preloaded && doctorId in preloaded
      ? preloaded[doctorId]
      : undefined;

  const [state, setState] = useState<DoctorVitalsConfigState>(() => {
    if (!doctorId) return { status: "ready", config: null };
    if (preloadedEntry !== undefined) {
      return { status: "ready", config: preloadedEntry };
    }
    return { status: "loading", config: null };
  });

  useEffect(() => {
    let active = true;
    if (!doctorId) {
      setState({ status: "ready", config: null });
      return;
    }
    // Keep the preloaded value on screen while the fresh copy loads; only a
    // miss (or a new doctor) needs the skeleton.
    if (!preloaded || !(doctorId in preloaded)) {
      setState({ status: "loading", config: null });
    }
    getDoctorVitalsConfigAction(doctorId).then((result) => {
      if (!active) return;
      if (!result.ok) {
        // Never downgrade a preloaded config to an error — it is better to
        // keep the stale-but-usable fields than to blank the form.
        setState((prev) =>
          prev.status === "ready" ? prev : { status: "error", config: null },
        );
        return;
      }
      setState({ status: "ready", config: result.data });
    });
    return () => {
      active = false;
    };
  }, [doctorId, preloaded]);

  return state;
}
