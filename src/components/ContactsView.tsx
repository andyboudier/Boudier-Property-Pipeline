"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Contact } from "@/lib/types";
import { DEFAULT_CATEGORIES, allCategories, matchesQuery } from "@/lib/contacts";
import { actionAddContact, actionUpdateContact, actionDeleteContact, actionScanCard } from "@/app/actions";
import { CameraScanner } from "./CameraScanner";

type Draft = Partial<Contact>;

export function ContactsView({ initialContacts }: { initialContacts: Contact[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null); // open modal when non-null
  const [scanning, setScanning] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  // Read a card image (already cropped/compressed) and open the prefilled modal.
  async function scanImage(dataUrl: string) {
    setMsg(null);
    setScanning(true);
    try {
      const res = await actionScanCard(dataUrl);
      if (res.ok) {
        setEditing({ ...res.fields, notes: "", cardImageUrl: dataUrl });
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
      await scanImage(await compressImage(file));
    } catch {
      setMsg("Couldn't process that image.");
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          className="field sm:max-w-sm"
          placeholder="Search name, company, email, phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          <button onClick={() => setShowCamera(true)} disabled={scanning} className="btn-primary disabled:opacity-60">
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

      {showCamera && (
        <CameraScanner
          onClose={() => setShowCamera(false)}
          onCapture={(dataUrl) => {
            setShowCamera(false);
            void scanImage(dataUrl);
          }}
        />
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
        <img src={c.cardImageUrl} alt="Business card" className="mt-2 max-h-16 w-auto rounded border border-paper-line" />
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
          {c.cardImageUrl && <img src={c.cardImageUrl} alt="Business card" className="max-h-32 rounded-md border border-paper-line" />}
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
