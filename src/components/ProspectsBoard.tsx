"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Lead, WatchSource } from "@/lib/types";
import {
  actionAddProspect,
  actionPromoteProspect,
  actionSetProspectStatus,
  actionDeleteProspect,
  actionAddWatch,
  actionDeleteWatch,
} from "@/app/actions";
import { gbp, num } from "@/lib/format";

const STATUS_COLOR: Record<Lead["status"], string> = {
  new: "#C2872B",
  reviewing: "#16202B",
  promoted: "#2E7D5B",
  rejected: "#B23A48",
};

export function ProspectsBoard({ initialLeads, initialWatch }: { initialLeads: Lead[]; initialWatch: WatchSource[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Add prospect
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [paste, setPaste] = useState("");

  async function add(payload: { url?: string; html?: string }) {
    setAdding(true);
    setMsg(null);
    try {
      const res = await actionAddProspect(payload);
      if (res.ok) {
        setMsg({ kind: "ok", text: "Prospect added." });
        setUrl("");
        setPaste("");
        setShowPaste(false);
        router.refresh();
      } else {
        setMsg({ kind: "warn", text: res.warning || "Couldn't read that listing." });
        if (res.blocked) setShowPaste(true);
      }
    } catch {
      setMsg({ kind: "err", text: "Something went wrong adding that prospect." });
    } finally {
      setAdding(false);
    }
  }

  function promote(l: Lead) {
    startTransition(async () => {
      const res = await actionPromoteProspect(l.id);
      if (res.ok && res.propertyId) router.push(`/property/${res.propertyId}`);
      else router.refresh();
    });
  }
  function setStatus(l: Lead, status: "reviewing" | "rejected") {
    startTransition(async () => {
      await actionSetProspectStatus(l.id, status);
      router.refresh();
    });
  }
  function remove(l: Lead) {
    if (!window.confirm(`Delete prospect "${l.name}"?`)) return;
    startTransition(async () => {
      await actionDeleteProspect(l.id);
      router.refresh();
    });
  }

  const active = initialLeads.filter((l) => l.status !== "promoted");
  const promoted = initialLeads.filter((l) => l.status === "promoted");

  return (
    <div className="space-y-6">
      {/* Add prospect */}
      <section className="card border-bronze/40 p-5">
        <h2 className="font-serif text-lg text-ink">Add a prospect</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Paste a property URL — Rightmove, a commercial agent, or (with the scraper key) Zoopla. AI reads the page into the
          fields. Blocked sites fall back to pasting the page source.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className="field flex-1" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button onClick={() => add({ url })} disabled={adding || !url.trim()} className="btn-primary disabled:opacity-60">
            {adding ? "Reading…" : "Add"}
          </button>
        </div>
        {msg && (
          <p className={`mt-2 text-sm ${msg.kind === "ok" ? "text-status-go" : msg.kind === "err" ? "text-status-stop" : "text-bronze-dark"}`}>
            {msg.text}
          </p>
        )}
        {showPaste && (
          <div className="mt-3">
            <label className="label">Paste page source</label>
            <textarea className="field min-h-[110px] font-mono text-xs" placeholder="Paste the full HTML…" value={paste} onChange={(e) => setPaste(e.target.value)} />
            <button onClick={() => add({ html: paste, url })} disabled={adding || !paste.trim()} className="btn-ghost mt-2 disabled:opacity-60">
              Add from pasted source
            </button>
          </div>
        )}
      </section>

      {/* Active prospects */}
      <section>
        <h2 className="mb-2 font-serif text-lg text-ink">To review ({active.length})</h2>
        {active.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-muted">No prospects yet. Add one above.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((l) => (
              <article key={l.id} className="card flex overflow-hidden">
                <div className="h-auto w-24 shrink-0 bg-paper-line">
                  {l.imageUrl ? <img src={l.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-ink">{l.name}</span>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ background: `${STATUS_COLOR[l.status]}1A`, color: STATUS_COLOR[l.status] }}>
                      {l.status}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-ink-muted">
                    {[l.town, l.source].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-soft tabular-nums">
                    <span>{gbp(l.guidePrice)}</span>
                    {l.sizeSqFt != null && <span>{num(l.sizeSqFt)} ft²</span>}
                    {l.currentUse && <span className="truncate text-ink-muted">{l.currentUse}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button onClick={() => promote(l)} disabled={pending} className="btn-bronze px-2 py-1 text-xs disabled:opacity-60">
                      Promote →
                    </button>
                    {l.status !== "reviewing" && (
                      <button onClick={() => setStatus(l, "reviewing")} disabled={pending} className="btn-ghost px-2 py-1 text-xs">
                        Reviewing
                      </button>
                    )}
                    {l.url && (
                      <a href={l.url} target="_blank" rel="noreferrer" className="btn-ghost px-2 py-1 text-xs">
                        Listing ↗
                      </a>
                    )}
                    <button onClick={() => remove(l)} disabled={pending} className="ml-auto px-2 py-1 text-xs text-ink-muted hover:text-status-stop">
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {promoted.length > 0 && (
        <section>
          <h2 className="mb-2 font-serif text-sm uppercase tracking-wide text-ink-muted">Promoted ({promoted.length})</h2>
          <div className="flex flex-wrap gap-2">
            {promoted.map((l) => (
              <Link key={l.id} href={l.promotedPropertyId ? `/property/${l.promotedPropertyId}` : "/"} className="rounded-full border border-paper-line bg-white px-3 py-1 text-xs text-ink-soft hover:border-bronze">
                {l.name} →
              </Link>
            ))}
          </div>
        </section>
      )}

      <Watchlist initialWatch={initialWatch} />
    </div>
  );
}

function Watchlist({ initialWatch }: { initialWatch: WatchSource[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();

  function addW() {
    if (!url.trim()) return;
    startTransition(async () => {
      await actionAddWatch(label, url);
      setLabel("");
      setUrl("");
      router.refresh();
    });
  }
  function delW(id: string) {
    startTransition(async () => {
      await actionDeleteWatch(id);
      router.refresh();
    });
  }

  return (
    <section className="card p-5">
      <h2 className="font-serif text-lg text-ink">Auto-monitor</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Add an agent&apos;s search/results page. A scheduled scan reads each page and adds any new listings as prospects
        automatically (requires the scraper + AI keys; runs daily once enabled).
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input className="field sm:w-48" placeholder="Label (e.g. Hicks Baker)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="field flex-1" placeholder="https://…/commercial-property-for-sale" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button onClick={addW} disabled={pending || !url.trim()} className="btn-ghost disabled:opacity-60">Add</button>
      </div>
      {initialWatch.length > 0 && (
        <ul className="mt-3 divide-y divide-paper-line border-t border-paper-line">
          {initialWatch.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span className="text-ink">{w.label}</span>
                <span className="ml-2 truncate text-xs text-ink-muted">{w.url}</span>
                {w.lastScanAt && <span className="ml-2 text-[11px] text-ink-muted">scanned {new Date(w.lastScanAt).toLocaleDateString("en-GB")}</span>}
              </span>
              <button onClick={() => delW(w.id)} disabled={pending} className="shrink-0 text-xs text-ink-muted hover:text-status-stop">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
