"use client";

import { useEffect, useRef, useState } from "react";

// A numeric field that's easy to edit: a text input under the hood (number
// inputs can't be selected), showing blank when 0. On focus the whole value is
// highlighted so a click-and-type replaces it; the onMouseUp preventDefault
// stops the click from collapsing that selection. Decimals / partial entry
// ("1.") are preserved while typing; empty maps to 0.
export function NumberInput({
  value,
  onChange,
  className,
  placeholder,
  title,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  title?: string;
}) {
  const focusedRef = useRef(false);
  const [text, setText] = useState(() => (value ? String(value) : ""));

  // Reflect external value changes (live recalcs) only while not being edited.
  useEffect(() => {
    if (!focusedRef.current) setText(value ? String(value) : "");
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      title={title}
      value={text}
      onFocus={(e) => {
        focusedRef.current = true;
        e.currentTarget.select();
      }}
      onMouseUp={(e) => {
        // The click's mouseup would place the caret and collapse the selection
        // made on focus — prevent it so the value stays highlighted.
        if (focusedRef.current) e.preventDefault();
      }}
      onBlur={() => {
        focusedRef.current = false;
        setText(value ? String(value) : "");
      }}
      onChange={(e) => {
        const raw = e.target.value;
        // Allow only a number being typed (digits, one dot, optional leading -).
        if (raw !== "" && !/^-?\d*\.?\d*$/.test(raw)) return;
        setText(raw);
        const n = raw === "" || raw === "-" || raw === "." || raw === "-." ? 0 : Number(raw);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}
