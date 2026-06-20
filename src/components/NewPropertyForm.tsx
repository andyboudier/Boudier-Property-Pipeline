"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Property } from "@/lib/types";
import { actionCreateProperty } from "@/app/actions";

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
};

export function NewPropertyForm() {
  const router = useRouter();
  const [d, setD] = useState<Draft>(EMPTY);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setD((s) => ({ ...s, [key]: value }));
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
      const res = await actionCreateProperty({ ...d, pricePerSqFt });
      if (res?.id) router.push(`/property/${res.id}`);
    });
  }

  return (
    <div className="space-y-5">
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
        <h2 className="font-serif text-lg text-ink">Listing (optional)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Listing source"><input className="field" value={d.listingSource ?? ""} onChange={(e) => set("listingSource", e.target.value)} /></Field>
          <Field label="Listing URL"><input className="field" value={d.listingUrl ?? ""} onChange={(e) => set("listingUrl", e.target.value)} /></Field>
        </div>
      </section>

      {error && <p className="text-sm text-status-stop">{error}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={submit} disabled={pending} className="btn-bronze disabled:opacity-60">
          {pending ? "Creating…" : "Create site & open"}
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
