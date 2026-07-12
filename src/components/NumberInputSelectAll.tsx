"use client";

import { useEffect } from "react";

/**
 * Spreadsheet-style entry for every numeric field: focusing a number input
 * selects its whole value, so typing replaces the default 0 instead of
 * appending to it. The mouseup guard stops the browser collapsing the
 * selection right after a click-focus.
 */
export function NumberInputSelectAll() {
  useEffect(() => {
    let justFocused: HTMLInputElement | null = null;

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === "number") {
        justFocused = t;
        t.select();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (justFocused && e.target === justFocused) {
        e.preventDefault(); // keep the select-all made on focus
      }
      justFocused = null;
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("mouseup", onMouseUp, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("mouseup", onMouseUp, true);
    };
  }, []);

  return null;
}
