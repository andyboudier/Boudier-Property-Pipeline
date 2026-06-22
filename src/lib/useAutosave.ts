"use client";

import { useEffect, useRef } from "react";

/**
 * Debounced autosave for the assessment forms. It reuses each form's existing
 * `save()` (so the "Saving…/Saved" status keeps working) and debounces it after
 * the user stops editing. `persist` is a fire-and-forget used only when the
 * component unmounts mid-edit (e.g. navigating away) so the last change isn't
 * lost — it must not touch React state.
 */
export function useAutosave(opts: {
  data: unknown; // current form data — a new reference on each edit
  dirty: boolean; // true when there are unsaved changes
  save: () => void; // the form's own save (updates saved/dirty status)
  persist: () => void; // direct persist for unmount (no React state updates)
  delay?: number;
}) {
  const ref = useRef(opts);
  ref.current = opts;
  const { data, dirty, delay = 1000 } = opts;

  // Debounced save while editing.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => ref.current.save(), delay);
    return () => clearTimeout(t);
  }, [data, dirty, delay]);

  // Safety net: flush any pending change when leaving the page.
  useEffect(
    () => () => {
      if (ref.current.dirty) ref.current.persist();
    },
    [],
  );
}
