"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Property } from "@/lib/types";
import { actionCreateProperty, actionImportListing, actionUpdateProperty } from "@/app/actions";

type Draft = Omit<Property, "id" | "dcas" | "mac" | "ipad" | "createdAt" | "updatedAt">;

const EMPTY: Draft = {
  name: "",
  town: "",
  lpa: "",
  guidePrice: null,
  sizeSqFt: null,
  pricePerSqFt: null,
  currentUse: "",
  heritage: "",
  pdRoute: "",
  fullPlanningRoute: "",
  keyConstraints: "",
  planningPrinciple: "",
  likelyOutcome: "",
  priorityNextStep: "",
  listingSource: "",
  listingUrl: "",
  notes: "",
  documentsUrl: "",
};

type Msg = { kind: "ok" | "warn" | "err"; text: string };

export function NewPropertyForm({ propertyId, initial }: { propertyId?: string; initial?: Draft } = {}) {
  const router = useRouter();
  const editing = !!propertyId;
  const [d, setD] = useState<Draft>(initial ?? EMPTY);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Listing import
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<Msg | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteHtml, setPasteHtml] = useState("");

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setD((s) => ({ ...s, [key]: value }));
  }

  function applyImport(fields: Partial<Draft>) {
    setD((s) => {
      const next = { ...s };
      (Object.keys(fields) as (keyof Draft)[]).forEach((k) => {
        const v = fields[k];
        if (v !== undefined && v !== null && v !== "") (next as Record<string, unknown>)[k as string] = v;
      });
      return next;
    });
  }

  async function runImport(payload: { url?: string; html?: string }) {
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await actionImportListing(payload);
      if (res.fields) applyImport(res.fields as Partial<Draft>);
      if (res.ok) {
        const got = Object.entries(res.fields)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k]) => k)
          .filter((k) => !["listingSource", "listingUrl"].includes(k)).length;
        setImportMsg({ kind: "ok", text: `Imported ${got} field${got === 1 ? "" : "s"} from ${res.source}. Review below, then create the site.` });
        setShowPaste(false);
      } else {
        setImportMsg({ kind: "warn", text: res.warning ?? "Couldn't extract listing data." });
        setShowPaste(true);
      }
    } catch {
      setImportMsg({ kind: "err", text: "Import failed. Try pasting the page source instead." });
      setShowPaste(true);
    } finally {
      setImporting(false);
    }
  }

  function submit() {
    if (!d.name.trim()) {
      setError("Please enter a site name / address.");
      return;
    }
    setError(null);
    // Derive £/ft² if both known and not supplied.
    const pricePerSqFt =
      d.pricePerSqFt ?? (d.guidePrice && d.sizeSqFt ? Math.round(d.guidePrice / d.sizeSqFt) : null);
    startTransition(async () => {
      if (editing) {
        await actionUpdateProperty(propertyId!, { ...d, pricePerSqFt });
        router.push(`/property/${propertyId}`);
        router.refresh();
      } else {
        const res = await actionCreateProperty({ ...d, pricePerSqFt });
        if (res?.id) router.push(`/property/${res.id}`);
      }
    });
  }

  const msgColor = importMsg?.kind === "ok" ? "text-status-go" : importMsg?.kind === "err" ? "text-status-stop" : "text-bronze-dark";

  return (
    <div className="space-y-5">
      {/* Import from a listing (create only) */}
      {!editing && (
      <section className="card border-bronze/40 p-5">
        <h2 className="font-serif text-lg text-ink">Import from a listing</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Paste a property URL — a Rightmove listing or an agent&apos;s PDF particulars (e.g. Hicks Baker) — to auto-fill the
          fields below. Some sites (e.g. Zoopla) block automated fetching; if so, you&apos;ll be prompted to paste the page
          source instead.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="field flex-1"
            placeholder="https://www.rightmove.co.uk/properties/…"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
          />
          <button
            onClick={() => runImport({ url: importUrl })}
            disabled={importing || !importUrl.trim()}
            className="btn-primary disabled:opacity-60"
          >
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
        {importMsg && <p className={`mt-2 text-sm ${msgColor}`}>{importMsg.text}</p>}
        {showPaste && (
          <div className="mt-3">
            <label className="label">Paste page source</label>
            <p className="mb-1 text-xs text-ink-muted">
              In your browser open the listing, right-click → <em>View Page Source</em> (or press ⌥⌘U), select all, copy, and paste here.
            </p>
            <textarea
              className="field min-h-[120px] font-mono text-xs"
              placeholder="Paste the full HTML of the listing page…"
              value={pasteHtml}
              onChange={(e) => setPasteHtml(e.target.value)}
            />
            <button
              onClick={() => runImport({ html: pasteHtml, url: importUrl })}
              disabled={importing || !pasteHtml.trim()}
              className="btn-ghost mt-2 disabled:opacity-60"
            >
              Import from pasted source
            </button>
          </div>
        )}
      </section>
      )}

      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">Site</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Site / address *" full>
            <input className="field" value={d.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Town">
            <input className="field" value={d.town} onChange={(e) => set("town", e.target.value)} />
          </Field>
          <Field label="LPA (local planning authority)">
            <input className="field" value={d.lpa} onChange={(e) => set("lpa", e.target.value)} />
          </Field>
          <Field label="Guide price (£)">
            <input type="number" className="field" value={d.guidePrice ?? ""} onChange={(e) => set("guidePrice", toNum(e.target.value))} />
          </Field>
          <Field label="Size (ft²)">
            <input type="number" className="field" value={d.sizeSqFt ?? ""} onChange={(e) => set("sizeSqFt", toNum(e.target.value))} />
          </Field>
          <Field label="£ / ft² (optional — auto if blank)">
            <input type="number" className="field" value={d.pricePerSqFt ?? ""} onChange={(e) => set("pricePerSqFt", toNum(e.target.value))} />
          </Field>
          <Field label="Current use / class">
            <input className="field" value={d.currentUse} onChange={(e) => set("currentUse", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">Planning & site brief</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Heritage / designation"><input className="field" value={d.heritage} onChange={(e) => set("heritage", e.target.value)} /></Field>
          <Field label="PD route"><input className="field" value={d.pdRoute} onChange={(e) => set("pdRoute", e.target.value)} /></Field>
          <Field label="Full planning route"><input className="field" value={d.fullPlanningRoute} onChange={(e) => set("fullPlanningRoute", e.target.value)} /></Field>
          <Field label="Planning principle"><input className="field" value={d.planningPrinciple} onChange={(e) => set("planningPrinciple", e.target.value)} /></Field>
          <Field label="Key constraints" full><textarea className="field min-h-[60px]" value={d.keyConstraints} onChange={(e) => set("keyConstraints", e.target.value)} /></Field>
          <Field label="Likely outcome / verdict" full><textarea className="field min-h-[60px]" value={d.likelyOutcome} onChange={(e) => set("likelyOutcome", e.target.value)} /></Field>
          <Field label="Priority / next step" full><textarea className="field min-h-[60px]" value={d.priorityNextStep} onChange={(e) => set("priorityNextStep", e.target.value)} /></Field>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">Listing & notes (optional)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Listing source"><input className="field" value={d.listingSource ?? ""} onChange={(e) => set("listingSource", e.target.value)} /></Field>
          <Field label="Listing URL"><input className="field" value={d.listingUrl ?? ""} onChange={(e) => set("listingUrl", e.target.value)} /></Field>
          <Field label="Documents folder URL (OneDrive)" full>
            <input className="field" value={d.documentsUrl ?? ""} onChange={(e) => set("documentsUrl", e.target.value)} placeholder="Paste this site's OneDrive folder link" />
          </Field>
          <Field label="Notes" full>
            <textarea className="field min-h-[100px]" value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      </section>

      {error && <p className="text-sm text-status-stop">{error}</p>}

      <div className="flex justify-end gap-2">
        {editing && (
          <button onClick={() => router.push(`/property/${propertyId}`)} className="btn-ghost">
            Cancel
          </button>
        )}
        <button onClick={submit} disabled={pending} className="btn-bronze disabled:opacity-60">
          {pending ? (editing ? "Saving…" : "Creating…") : editing ? "Save changes" : "Create site & open"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function toNum(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
