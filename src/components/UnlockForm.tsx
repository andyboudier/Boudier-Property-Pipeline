"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { actionUnlock } from "@/app/actions";

export function UnlockForm({ from }: { from: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(false);
    startTransition(async () => {
      const res = await actionUnlock(pin);
      if (res.ok) {
        router.push(from || "/");
        router.refresh();
      } else {
        setError(true);
        setPin("");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mt-4"
    >
      <input
        autoFocus
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="••••"
        className="field text-center text-2xl tracking-[0.5em]"
        aria-label="Access code"
      />
      {error && <p className="mt-2 text-sm text-status-stop">Incorrect code.</p>}
      <button type="submit" disabled={pending || !pin} className="btn-bronze mt-3 w-full disabled:opacity-60">
        {pending ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
