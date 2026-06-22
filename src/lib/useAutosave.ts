"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved";

/**
 * Debounced autosave for the assessment forms.
 *
 * Tracks the last successfully-persisted value (by serialized key) rather than a
 * dirty flag, so it is race-free: only one save runs at a time, and if the value
 * changed again while a save was in flight it saves again afterwards
 * (last-write-wins). It never fires on mount, and flushes any pending change on
 * unmount so navigating away can't lose the latest edit.
 */
export function useAutosave<T>(
  value: T,
  persist: (v: T) => Promise<unknown>,
  opts: { delay?: number; serialize?: (v: T) => string } = {},
) {
  const delay = opts.delay ?? 1000;
  const key = opts.serialize ?? ((v: T) => JSON.stringify(v));

  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const savedKey = useRef<string>(key(value)); // baseline = initial value (no save on mount)
  const valueRef = useRef(value);
  valueRef.current = value;
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const v = valueRef.current;
    const k = key(v);
    if (k === savedKey.current) return; // nothing new to save
    if (running.current) return; // a save is in flight — it re-checks on completion
    running.current = true;
    setStatus("saving");
    try {
      await persistRef.current(v);
      savedKey.current = k;
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setStatus("saved");
    } catch {
      setStatus("idle");
    } finally {
      running.current = false;
      if (key(valueRef.current) !== savedKey.current) flush(); // newer edit arrived mid-save
    }
  }, [key]);

  // Debounce a save whenever the value diverges from what's persisted.
  useEffect(() => {
    if (key(value) === savedKey.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Flush on unmount so the last change isn't lost when leaving the page.
  useEffect(
    () => () => {
      if (key(valueRef.current) !== savedKey.current) persistRef.current(valueRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { status, savedAt, dirty: key(value) !== savedKey.current, saveNow: flush };
}
