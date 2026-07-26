"use client";

import { useEffect } from "react";

/**
 * Spreadsheet-style entry for every numeric field: focusing a number input
 * selects its whole value, so typing replaces the default 0 instead of
 * appending to it (no need to delete the 0 first).
 *
 * The select() is deferred past the click's own caret placement (which would
 * otherwise collapse the selection), so it sticks for both click and tab focus.
 */
export function NumberInputSelectAll() {
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== "number") return;
      // Run after the browser finishes handling the click (which places the
      // caret and would collapse a synchronous selection).
      requestAnimationFrame(() => {
        if (document.activeElement === t) {
          try {
            t.select();
          } catch {
            /* some inputs don't support select() — ignore */
          }
        }
      });
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  return null;
}
