"use client";

/**
 * `useRxDraft` — owns the medicine-list reducer, the extra draft meta, and
 * their debounced autosave.
 *
 * Autosave contract: 2.5 s after the last change the whole draft (v2
 * envelope + application/education/skincare/follow-up/labs meta) is pushed
 * through the injected `save` callback, mapped onto the same DB columns the
 * legacy builder used. State reports `idle / saving / saved / error` plus a
 * "Saved HH:MM" stamp; on failure the draft stays dirty and `retry()`
 * re-flushes immediately. A beforeunload guard warns while there are
 * unsaved changes.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { RxItem } from "../schema/rx-item";
import { rxEnvelopeSchema } from "../schema/rx-item";
import { rxReducer } from "./rx-reducer";

export type DraftStatus = "idle" | "saving" | "saved" | "error";

export type SaveResult = { ok: boolean; message?: string; id?: string };

export type LabRow = { test_name: string; notes: string };

export type DraftSnapshot = {
  schema_version: 2;
  items: RxItem[];
};

export type DraftMeta = {
  application: string;
  education: string;
  skincareAm: string[];
  skincarePm: string[];
  followUp: string;
  labs: LabRow[];
};

const EMPTY_META: DraftMeta = {
  application: "",
  education: "",
  skincareAm: [],
  skincarePm: [],
  followUp: "",
  labs: [],
};

/** Payload shape handed to the save callback (schema field names). */
export type DraftPayload = DraftSnapshot & {
  application_instructions: string;
  patient_education: string;
  skincare_routine_am: string;
  skincare_routine_pm: string;
  follow_up: string;
  lab_orders: LabRow[];
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
  /** Initial meta from the existing prescription row. */
  initialMeta?: Partial<DraftMeta>;
  /** Persists the full payload (typically `saveDermRxAction` pre-bound). */
  save: (payload: DraftPayload) => Promise<SaveResult>;
  /** Extra debounce override, mainly for tests. */
  debounceMs?: number;
}) {
  const { initialItems, initialMeta, save, debounceMs = AUTOSAVE_DEBOUNCE_MS } =
    options;

  const [state, dispatch] = useReducer(rxReducer, {
    items: initialItems,
    activeId: initialItems.length > 0 ? initialItems[0]!.id : null,
    notice: null,
  });
  const [meta, setMetaState] = useState<DraftMeta>({
    ...EMPTY_META,
    ...initialMeta,
  });
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lastSavedJson = useRef(
    JSON.stringify({ items: initialItems, ...EMPTY_META, ...initialMeta }),
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const payloadJson = useMemo(
    () => JSON.stringify({ items: state.items, ...meta }),
    [state.items, meta],
  );
  const dirty = payloadJson !== lastSavedJson.current;

  const setMeta = useCallback((patch: Partial<DraftMeta>) => {
    setMetaState((current) => ({ ...current, ...patch }));
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (payloadJson === lastSavedJson.current) return;
    const envelope = toEnvelope(state.items);
    if (!envelope) return;
    const payload: DraftPayload = {
      ...envelope,
      application_instructions: meta.application,
      patient_education: meta.education,
      skincare_routine_am: meta.skincareAm.join("\n"),
      skincare_routine_pm: meta.skincarePm.join("\n"),
      follow_up: meta.followUp,
      lab_orders: meta.labs.map((row) => ({
        test_name: row.test_name,
        notes: row.notes,
      })),
    };
    setStatus("saving");
    try {
      const saved = await save(payload);
      if (saved.ok) {
        lastSavedJson.current = payloadJson;
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
  }, [save, payloadJson, state.items, meta]);

  const retry = useCallback(() => {
    void flush();
  }, [flush]);

  // Debounced autosave.
  useEffect(() => {
    if (payloadJson === lastSavedJson.current) return;
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
  }, [payloadJson, flush, debounceMs]);

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
    meta,
    setMeta,
    dirty,
    status,
    savedAt,
    notice,
    clearNotice,
    flush,
    retry,
  };
}
