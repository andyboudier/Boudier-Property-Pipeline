"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { InvestorTerms } from "@/lib/types";
import { computeInvestor } from "@/lib/investorCalc";
import { actionSaveInvestor, actionUpdateProperty } from "@/app/actions";
import { gbp, pct } from "@/lib/format";

export function InvestorForm({
  propertyId,
  initial,
  initialImageUrl,
  netProfit,
}: {
  propertyId: string;
  initial: InvestorTerms;
  initialImageUrl: string;
  netProfit: number;
}) {
  const [t, setT] = useState<InvestorTerms>(initial);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImgError(null);
    setUploading(true);
    try {
      setImageUrl(await compressImage(file));
      setSavedAt(null);
    } catch {
      setImgError("Couldn't process that image — try a JPG or PNG.");
    } finally {
      setUploading(false);
    }
  }

  function set<K extends keyof InvestorTerms>(key: K, value: InvestorTerms[K]) {
    setT((s) => ({ ...s, [key]: value }));
    setSavedAt(null);
  }

  const out = computeInvestor(t, netProfit);

  function save() {
    startTransition(async () => {
      await actionSaveInvestor(propertyId, t);
      await actionUpdateProperty(propertyId, { imageUrl: imageUrl.trim() });
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    });
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">The raise</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Money label="Investment sought (£)" value={t.investmentSought} onChange={(v) => set("investmentSought", v)} />
          <Money label="Minimum investment (£)" value={t.minInvestment} onChange={(v) => set("minInvestment", v)} />
          <Num label="Term (months)" value={t.termMonths} onChange={(v) => set("termMonths", v)} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">Return offered</h2>
        <p className="mt-1 text-xs text-ink-muted">Fill whichever apply. If a target ROI is set it takes precedence; otherwise fixed rate + profit share are combined.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Pct label="Fixed interest (% p.a.)" value={t.interestRatePct} onChange={(v) => set("interestRatePct", v)} />
          <Pct label="Profit share (% of net profit)" value={t.profitSharePct} onChange={(v) => set("profitSharePct", v)} />
          <Pct label="Target ROI (% over term)" value={t.targetRoiPct} onChange={(v) => set("targetRoiPct", v)} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-paper-warm/70 p-3 text-sm sm:grid-cols-4">
          <Stat label="Investor profit" value={gbp(out.totalReturn)} />
          <Stat label="Capital returned" value={gbp(out.endValue)} />
          <Stat label="ROI" value={pct(out.roiPct)} />
          <Stat label="Annualised" value={pct(out.annualisedPct)} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">Pitch & contact</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Text label="Security" value={t.security} onChange={(v) => set("security", v)} placeholder="e.g. First legal charge over the asset" />
          <div className="block sm:col-span-2">
            <span className="label">Cover photo</span>
            <div className="mt-1 flex flex-wrap items-start gap-3">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="Cover preview" className="h-20 w-28 shrink-0 rounded border border-paper-line object-cover" />
              ) : (
                <div className="grid h-20 w-28 shrink-0 place-items-center rounded border border-dashed border-paper-line text-[10px] text-ink-muted">
                  No image
                </div>
              )}
              <div className="flex min-w-[220px] flex-1 flex-col gap-2">
                <div className="flex gap-2">
                  <label className="btn-ghost cursor-pointer text-sm">
                    {uploading ? "Processing…" : "Upload photo"}
                    <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
                  </label>
                  {imageUrl && (
                    <button type="button" onClick={() => { setImageUrl(""); setSavedAt(null); }} className="btn-ghost text-sm">
                      Remove
                    </button>
                  )}
                </div>
                <input
                  className="field"
                  value={imageUrl.startsWith("data:") ? "" : imageUrl}
                  onChange={(e) => { setImageUrl(e.target.value); setSavedAt(null); }}
                  placeholder="…or paste an image URL (auto-filled from listing imports)"
                />
                {imageUrl.startsWith("data:") && <span className="text-[11px] text-ink-muted">Using an uploaded photo.</span>}
                {imgError && <span className="text-[11px] text-status-stop">{imgError}</span>}
              </div>
            </div>
          </div>
          <label className="block sm:col-span-2">
            <span className="label">Highlights (one per line)</span>
            <textarea className="field min-h-[90px]" value={t.highlights} onChange={(e) => set("highlights", e.target.value)} placeholder={"Strong Bristol market\nPlanning principle established\n18-month exit"} />
          </label>
          <Text label="Contact name" value={t.contactName} onChange={(v) => set("contactName", v)} />
          <Text label="Contact email" value={t.contactEmail} onChange={(v) => set("contactEmail", v)} />
          <Text label="Contact phone" value={t.contactPhone} onChange={(v) => set("contactPhone", v)} />
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {savedAt && <span className="text-sm text-status-go">Saved · {savedAt}</span>}
        <Link href={`/property/${propertyId}/presentation`} className="btn-ghost">Preview presentation →</Link>
        <button onClick={save} disabled={pending} className="btn-bronze disabled:opacity-60">
          {pending ? "Saving…" : "Save investor terms"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
function Money({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <Field label={label}>
      <input type="number" className="field tabular-nums" value={value ?? ""} onChange={(e) => onChange(toNum(e.target.value))} />
    </Field>
  );
}
function Num({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <Field label={label}>
      <input type="number" className="field tabular-nums" value={value ?? ""} onChange={(e) => onChange(toNum(e.target.value))} />
    </Field>
  );
}
function Pct({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={0.1}
        className="field tabular-nums"
        value={value == null ? "" : Math.round(value * 1000) / 10}
        onChange={(e) => {
          const n = toNum(e.target.value);
          onChange(n == null ? null : n / 100);
        }}
      />
    </Field>
  );
}
function Text({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <input className="field" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </Field>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="tabular-nums font-semibold text-ink">{value}</div>
    </div>
  );
}
function toNum(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Resize + JPEG-compress an image file to a small data URL safe to store. */
async function compressImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("read failed"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("decode failed"));
    i.src = dataUrl;
  });

  const render = (maxDim: number, quality: number) => {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  };

  // Keep the stored string comfortably small (well under Firestore/action limits).
  const LIMIT = 600 * 1024;
  for (const [dim, q] of [[1600, 0.72], [1400, 0.68], [1100, 0.62], [900, 0.55]] as const) {
    const out = render(dim, q);
    if (out.length <= LIMIT) return out;
  }
  return render(800, 0.5);
}
