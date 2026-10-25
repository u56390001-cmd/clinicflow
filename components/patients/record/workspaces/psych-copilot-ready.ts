"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny module store for "the copilot has an unreviewed session draft".
 *
 * The draft lives deep inside `PsychWorkspace`, but the Sessions tab trigger
 * renders in the record's tab strip — sibling branches, no shared parent with
 * state to lift into. A `useSyncExternalStore` bridge (~20 lines) keeps that
 * plumbing surgical: the workspace sets, the tab strip reads.
 */

let ready = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setPsychCopilotReady(value: boolean) {
  if (value === ready) return;
  ready = value;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePsychCopilotReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ready,
    () => false,
  );
}
