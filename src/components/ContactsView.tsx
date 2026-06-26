"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Contact } from "@/lib/types";
import { DEFAULT_CATEGORIES, allCategories, matchesQuery } from "@/lib/contacts";
import { actionAddContact, actionUpdateContact, actionDeleteContact, actionScanCard } from "@/app/actions";
import { CameraScanner, cameraErrorMessage } from "./CameraScanner";

type Draft = Partial<Contact>;

export function ContactsView({ initialContacts }: { initialContacts: Contact[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null); // open modal when non-null
  const [scanning, setScanning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null); // live in-app camera
  const [camErr, setCamErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null); // upload (gallery / file)
  const nativeRef = useRef<HTMLInputElement>(null); // device camera (OS) fallback

  // Acquire the camera inside the tap handler — Safari/iOS require getUserMedia
  // to run in a user gesture, so we can't do it from an effect after opening.
  async function takePhoto() {
    setMsg(null);
    setCamErr(null);
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (typeof window !== "undefined" && (!window.isSecureContext || !md?.getUserMedia)) {
      nativeRef.current?.click(); // no in-app camera available → OS camera
      return;
    }
    try {
      const s = await md!.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      setStream(s);
    } catch (e) {
      setCamErr(cameraErrorMessage(e));
    }
  }
  function closeCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }

  const categories = useMemo(() => allCategories(initialContacts), [initialContacts]);
  const filtered = useMemo(
    () => initialContacts.filter((c) => (!cat || c.category === cat) && matchesQuery(c, query)),
    [initialContacts, cat, query],
  );
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of initialContacts) if (c.category) m[c.category] = (m[c.category] || 0) + 1;
    return m;
  }, [initialContacts]);

  // Read a card image and open the prefilled modal. `autoCrop` crops the stored
  // image to the card the AI detected (for full-frame photos / uploads); the
  // in-app camera already crops to its frame, so it passes false.
  async function scanImage(dataUrl: string, autoCrop: boolean) {
    setMsg(null);
    setScanning(true);
    try {
      const res = await actionScanCard(dataUrl);
      if (res.ok) {
        const { cardBox, ...fields } = res.fields;
        let cardImageUrl = dataUrl;
        if (autoCrop && cardBox) {
          try {
            cardImageUrl = await cropToBox(dataUrl, cardBox);
          } catch {
            /* keep full image */
          }
        }
        setEditing({ ...fields, notes: "", cardImageUrl });
      } else {
        setMsg(res.error || "Couldn't read that card.");
        setEditing({ cardImageUrl: dataUrl }); // let them fill it in manually
      }
    } catch {
      setMsg("Couldn't process that image.");
    } finally {
      setScanning(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    try {
      await scanImage(await compressImage(file), true);
    } catch {
      setMsg("Couldn't process that image.");
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-sm sm:flex-1">
          <input
            className="field w-full pr-8"
            placeholder="Search name, company, email, phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          <input ref={nativeRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickFile} />
          <button onClick={takePhoto} disabled={scanning} className="btn-primary disabled:opacity-60">
            {scanning ? "Reading card…" : "📷 Take photo"}
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={scanning} className="btn-ghost">Upload</button>
          <button onClick={() => setEditing({})} className="btn-ghost">+ Add</button>
        </div>
      </div>
      {msg && <p className="text-sm text-bronze-dark">{msg}</p>}

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5">
        <Chip label={`All (${initialContacts.length})`} active={cat === null} onClick={() => setCat(null)} />
        {categories
          .filter((c) => counts[c])
          .map((c) => (
            <Chip key={c} label={`${c} (${counts[c]})`} active={cat === c} onClick={() => setCat(cat === c ? null : c)} />
          ))}
      </div>

      {(query || cat) && (
        <p className="text-xs text-ink-muted">
          Showing {filtered.length} of {initialContacts.length} contact{initialContacts.length === 1 ? "" : "s"}
          {query && <> matching “{query}”</>}
          {cat && <> in {cat}</>}
        </p>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-ink-muted">
          {initialContacts.length === 0 ? "No contacts yet — scan a business card or add one." : "No contacts match."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <ContactCard key={c.id} c={c} onEdit={() => setEditing(c)} />
          ))}
        </div>
      )}

      {stream && (
        <CameraScanner
          stream={stream}
          onClose={closeCamera}
          onCapture={(dataUrl) => {
            closeCamera();
            void scanImage(dataUrl, false); // already cropped to the frame
          }}
        />
      )}

      {camErr && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 p-4" onClick={() => setCamErr(null)}>
          <div className="w-full max-w-md rounded-xl bg-paper-warm p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-lg text-ink">Camera</h3>
            <p className="mt-2 text-sm text-ink-soft">{camErr}</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button onClick={() => setCamErr(null)} className="btn-ghost">Close</button>
              <button onClick={() => { setCamErr(null); fileRef.current?.click(); }} className="btn-ghost">Upload photo</button>
              <button onClick={() => { setCamErr(null); nativeRef.current?.click(); }} className="btn-primary">Use device camera</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <ContactModal
          draft={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-3 py-1 text-xs font-medium transition"
      style={{ borderColor: active ? "#16202B" : "#E7E4DE", background: active ? "#16202B" : "#fff", color: active ? "#fff" : "#5B6976" }}
    >
      {label}
    </button>
  );
}

function ContactCard({ c, onEdit }: { c: Contact; onEdit: () => void }) {
  return (
    <article className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{c.name}</div>
          <div className="truncate text-xs text-ink-muted">{[c.jobTitle, c.company].filter(Boolean).join(" · ")}</div>
        </div>
        {c.category && (
          <span className="shrink-0 rounded-full bg-bronze/15 px-2 py-0.5 text-[10px] font-semibold text-bronze-dark">{c.category}</span>
        )}
      </div>
      <div className="mt-2 space-y-0.5 text-sm">
        {c.email && <a href={`mailto:${c.email}`} className="block truncate text-ink-soft hover:text-bronze-dark">✉ {c.email}</a>}
        {c.phone && <a href={`tel:${c.phone}`} className="block text-ink-soft hover:text-bronze-dark">☎ {c.phone}</a>}
        {c.mobile && <a href={`tel:${c.mobile}`} className="block text-ink-soft hover:text-bronze-dark">📱 {c.mobile}</a>}
        {c.website && (
          <a href={withHttp(c.website)} target="_blank" rel="noreferrer" className="block truncate text-ink-soft hover:text-bronze-dark">
            🌐 {c.website}
          </a>
        )}
        {c.address && <div className="text-xs text-ink-muted">{c.address}</div>}
      </div>
      {c.notes && <p className="mt-2 line-clamp-3 text-xs text-ink-muted">{c.notes}</p>}
      {c.cardImageUrl && (
        <img src={c.cardImageUrl} alt="Business card" className="mt-2 h-16 w-auto max-w-full self-start rounded border border-paper-line object-contain" />
      )}
      <div className="mt-auto pt-3 text-right">
        <button onClick={onEdit} className="text-xs text-ink-muted hover:text-bronze-dark">Edit</button>
      </div>
    </article>
  );
}

function ContactModal({ draft, categories, onClose, onSaved }: { draft: Draft; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const [c, setC] = useState<Draft>(draft);
  const [pending, startTransition] = useTransition();
  const isEdit = !!draft.id;
  const set = (k: keyof Contact, v: string) => setC((s) => ({ ...s, [k]: v }));
  const catOptions = useMemo(() => [...new Set([...DEFAULT_CATEGORIES, ...categories])], [categories]);

  function save() {
    startTransition(async () => {
      if (isEdit && draft.id) await actionUpdateContact(draft.id, c);
      else await actionAddContact(c);
      onSaved();
    });
  }
  function remove() {
    if (!draft.id || !window.confirm(`Delete ${draft.name || "this contact"}?`)) return;
    startTransition(async () => {
      await actionDeleteContact(draft.id!);
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-6 w-full max-w-lg rounded-xl bg-paper-warm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between rounded-t-xl bg-ink px-5 py-3 text-paper">
          <h2 className="font-serif text-lg">{isEdit ? "Edit contact" : "New contact"}</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-paper/80 hover:bg-white/10">✕</button>
        </div>
        <div className="space-y-3 p-5">
          {c.cardImageUrl && <img src={c.cardImageUrl} alt="Business card" className="max-h-40 w-auto max-w-full rounded-md border border-paper-line object-contain" />}
          <Field label="Name" value={c.name} onChange={(v) => set("name", v)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Job title" value={c.jobTitle} onChange={(v) => set("jobTitle", v)} />
            <Field label="Company" value={c.company} onChange={(v) => set("company", v)} />
          </div>
          <label className="block">
            <span className="label">Category</span>
            <input className="field" list="contact-cats" value={c.category ?? ""} onChange={(e) => set("category", e.target.value)} placeholder="Architect, Estate Agent…" />
            <datalist id="contact-cats">{catOptions.map((o) => <option key={o} value={o} />)}</datalist>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" value={c.email} onChange={(v) => set("email", v)} type="email" />
            <Field label="Website" value={c.website} onChange={(v) => set("website", v)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone" value={c.phone} onChange={(v) => set("phone", v)} type="tel" />
            <Field label="Mobile" value={c.mobile} onChange={(v) => set("mobile", v)} type="tel" />
          </div>
          <Field label="Address" value={c.address} onChange={(v) => set("address", v)} />
          <label className="block">
            <span className="label">Notes</span>
            <textarea className="field min-h-[70px]" value={c.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </label>
          <div className="flex items-center justify-between pt-1">
            {isEdit ? (
              <button onClick={remove} disabled={pending} className="text-sm text-ink-muted hover:text-status-stop">Delete</button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={pending} className="btn-primary disabled:opacity-60">
                {pending ? "Saving…" : "Save contact"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value?: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input type={type} className="field" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function withHttp(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function loadImg(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("decode failed"));
    i.src = dataUrl;
  });
}

// Crop an image to a [left, top, width, height] fractional box (the card the AI
// detected), with a little padding. Falls back to the original if implausible.
async function cropToBox(dataUrl: string, box: number[]): Promise<string> {
  const [x, y, w, h] = box;
  if (!(w > 0.15 && h > 0.1)) return dataUrl; // box too small to trust
  const img = await loadImg(dataUrl);
  const pad = 0.03;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const L = clamp(x - pad);
  const T = clamp(y - pad);
  const R = clamp(x + w + pad);
  const B = clamp(y + h + pad);
  const sx = L * img.width;
  const sy = T * img.height;
  const sw = (R - L) * img.width;
  const sh = (B - T) * img.height;
  if (sw < 20 || sh < 20) return dataUrl;
  const scale = Math.min(1, 1400 / sw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

// Compress an image file to a small JPEG data URL (kept under Firestore/action limits).
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
  const maxDim = 1400;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.8);
}
