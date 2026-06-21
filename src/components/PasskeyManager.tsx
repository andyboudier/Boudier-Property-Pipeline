"use client";

import { useEffect, useState, useTransition } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import {
  actionPasskeyRegisterOptions,
  actionPasskeyRegisterVerify,
  actionListPasskeys,
  actionDeletePasskey,
} from "@/app/actions";

type Item = { id: string; label: string; createdAt: string };

export function PasskeyManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    try {
      setItems(await actionListPasskeys());
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function add() {
    setMsg(null);
    setAdding(true);
    try {
      const options = await actionPasskeyRegisterOptions();
      const resp = await startRegistration({ optionsJSON: options });
      const label = deviceLabel();
      const res = await actionPasskeyRegisterVerify(resp, label);
      if (res.ok) {
        setMsg({ ok: true, text: "Touch ID enabled on this device." });
        refresh();
      } else {
        setMsg({ ok: false, text: res.error || "Couldn't enable Touch ID." });
      }
    } catch (e) {
      const cancelled = e instanceof Error && e.name === "NotAllowedError";
      setMsg({ ok: false, text: cancelled ? "Cancelled." : e instanceof Error ? e.message : "Couldn't enable Touch ID." });
    } finally {
      setAdding(false);
    }
  }

  function remove(it: Item) {
    if (!window.confirm(`Remove "${it.label}"? That device will need the code again.`)) return;
    startTransition(async () => {
      await actionDeletePasskey(it.id);
      refresh();
    });
  }

  return (
    <section className="card p-5">
      <h2 className="font-serif text-lg text-ink">Device access (Touch ID)</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Enable Touch ID / a passkey on this device so you can unlock without typing the code. The access code still works as a
        fallback.
      </p>

      <button onClick={add} disabled={adding} className="btn-primary mt-3 disabled:opacity-60">
        {adding ? "Waiting for Touch ID…" : "Enable Touch ID on this device"}
      </button>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-status-go" : "text-status-stop"}`}>{msg.text}</p>}

      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-paper-line border-t border-paper-line">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-ink">
                {it.label}
                <span className="ml-2 text-xs text-ink-muted">added {new Date(it.createdAt).toLocaleDateString("en-GB")}</span>
              </span>
              <button
                onClick={() => remove(it)}
                disabled={pending}
                className="text-xs text-ink-muted hover:text-status-stop disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function deviceLabel(): string {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  if (/Macintosh/.test(ua)) return "Mac (Touch ID)";
  if (/iPhone|iPad/.test(ua)) return "iOS device";
  if (/Windows/.test(ua)) return "Windows (Hello)";
  if (/Android/.test(ua)) return "Android device";
  return "This device";
}
