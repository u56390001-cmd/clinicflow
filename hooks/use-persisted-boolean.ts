"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A boolean UI preference that survives a reload.
 *
 * The server always renders `defaultValue`; the saved value is applied in an
 * effect after hydration, so the first paint matches the server markup exactly
 * instead of triggering a React hydration mismatch. Writes are guarded because
 * localStorage throws when the browser blocks storage (private windows,
 * blocked site data) — a preference that cannot be saved must not break the
 * control that owns it.
 */
export function usePersistedBoolean(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) setValue(stored === "true");
    } catch {
      // Storage unavailable — stay on the default.
    }
  }, [key]);

  const setValuePersisted = useCallback(
    (next: boolean | ((previous: boolean) => boolean)) => {
      setValue((previous) => {
        const resolved =
          typeof next === "function" ? next(previous) : next;
        try {
          window.localStorage.setItem(key, String(resolved));
        } catch {
          // Storage unavailable — the in-memory value still applies.
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, setValuePersisted] as const;
}
