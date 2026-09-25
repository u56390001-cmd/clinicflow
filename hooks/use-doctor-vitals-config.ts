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
 * shows a skeleton or re-flows its field grid after opening. Only a miss
 * falls back to the client fetch.
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
    if (preloaded && doctorId in preloaded) {
      setState({ status: "ready", config: preloaded[doctorId] });
      return;
    }
    setState({ status: "loading", config: null });
    getDoctorVitalsConfigAction(doctorId).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setState({ status: "error", config: null });
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
