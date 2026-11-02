"use client";

/**
 * `useRxDraft` — owns the medicine-list reducer plus its debounced autosave.
 *
 * Autosave contract: 2.5 s after the last change the whole draft (v2
 * envelope) is pushed through the injected `save` callback. State reports
 * `idle / saving / saved / error` plus a "Saved HH:MM" stamp; on failure the
 * draft stays dirty and `retry()` re-flushes immediately. A beforeunload
 * guard warns while there are unsaved changes.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { RxItem } from "../schema/rx-item";
import { rxEnvelopeSchema } from "../schema/rx-item";
import { rxReducer } from "./rx-reducer";

export type DraftStatus = "idle" | "saving" | "saved" | "error";

export type SaveResult = { ok: boolean; message?: string };

export type DraftSnapshot = {
  schema_version: 2;
  items: RxItem[];
};

const AUTOSAVE_DEBOUNCE_MS = 2_500;

function toEnvelope(items: RxItem[]): DraftSnapshot | null {
  const parsed = rxEnvelopeSchema.safeParse({
    schema_version: 2,
    items,
  });
  return parsed.success ? parsed.data : null;
}

function stamp(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function useRxDraft(options: {
  initialItems: RxItem[];
  /** Persists the envelope (typically `saveDermRxAction` pre-bound). */
  save: (snapshot: DraftSnapshot) => Promise<SaveResult>;
  /** Extra debounce override, mainly for tests. */
  debounceMs?: number;
}) {
  const { initialItems, save, debounceMs = AUTOSAVE_DEBOUNCE_MS } = options;

  const [state, dispatch] = useReducer(rxReducer, {
    items: initialItems,
    activeId: initialItems.length > 0 ? initialItems[0]!.id : null,
    notice: null,
  });
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lastSavedJson = useRef<string>(JSON.stringify(initialItems));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const itemsJson = useMemo(() => JSON.stringify(state.items), [state.items]);
  const dirty = itemsJson !== lastSavedJson.current;

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const envelope = toEnvelope(state.items);
    if (!envelope) return;
    if (itemsJson === lastSavedJson.current) return;
    setStatus("saving");
    try {
      const saved = await save(envelope);
      if (saved.ok) {
        lastSavedJson.current = itemsJson;
        setSavedAt(stamp(new Date()));
        setStatus("saved");
        setNotice(null);
      } else {
        setStatus("error");
        setNotice(saved.message ?? "Save failed. Retry.");
      }
    } catch {
      setStatus("error");
      setNotice("Save failed. Retry.");
    }
  }, [save, itemsJson, state.items]);

  const retry = useCallback(() => {
    void flush();
  }, [flush]);

  // Debounced autosave.
  useEffect(() => {
    if (itemsJson === lastSavedJson.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        timer.current = null;
        void flush();
      },
      debounceMs,
    );
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [itemsJson, flush, debounceMs]);

  // Surface the reducer-level route-notice through the hook consumer.
  useEffect(() => {
    setNotice(state.notice);
  }, [state.notice]);

  // Unsaved-changes browser guard.
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const clearNotice = useCallback(() => {
    setNotice(null);
    dispatch({ type: "CLEAR_NOTICE" });
  }, []);

  return {
    state,
    dispatch,
    dirty,
    status,
    savedAt,
    notice,
    clearNotice,
    flush,
    retry,
  };
}
