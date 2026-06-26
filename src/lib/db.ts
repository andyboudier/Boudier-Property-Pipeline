import "server-only";
import type { Property, ProcedabilitySettings, Dcas, Mac, Ipad, PropertySnapshot, Lead, WatchSource, MonitorCriteria, WatchResult, Contact } from "./types";
import { getDb, isFirestoreConfigured } from "./firebaseAdmin";
import { SEED_PROPERTIES } from "./seedData";
import { DEFAULT_SETTINGS } from "./procedability";
import { DEFAULT_CRITERIA } from "./monitorCriteria";

const COLLECTION = "properties";
const SNAPSHOTS = "snapshots";
const LEADS = "leads";
const WATCHLIST = "watchlist";
const SETTINGS_DOC = ["settings", "procedability"] as const;

// ── In-memory demo store (used when Firestore isn't configured) ──────────────
// Persists within a single running process (great for `next dev`). Serverless
// instances are stateless, so connect Firestore for durable persistence.
const g = globalThis as unknown as {
  __boudierStore?: Map<string, Property>;
  __boudierSettings?: ProcedabilitySettings;
  __boudierSnapshots?: PropertySnapshot[];
  __boudierLeads?: Lead[];
  __boudierWatch?: WatchSource[];
  __boudierCriteria?: MonitorCriteria;
  __boudierIgnored?: IgnoredUrl[];
  __boudierContacts?: Contact[];
};
function memStore(): Map<string, Property> {
  if (!g.__boudierStore) {
    g.__boudierStore = new Map(SEED_PROPERTIES.map((p) => [p.id, structuredClone(p)]));
  }
  return g.__boudierStore;
}
function memSnapshots(): PropertySnapshot[] {
  if (!g.__boudierSnapshots) g.__boudierSnapshots = [];
  return g.__boudierSnapshots;
}

const now = () => new Date().toISOString();
const stripUndefined = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

export const usingFirestore = isFirestoreConfigured();

// ── Properties ───────────────────────────────────────────────────────────────
export async function listProperties(): Promise<Property[]> {
  const db = getDb();
  if (!db) return [...memStore().values()].sort((a, b) => a.name.localeCompare(b.name));
  const snap = await db.collection(COLLECTION).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Property, "id">) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProperty(id: string): Promise<Property | null> {
  const db = getDb();
  if (!db) return memStore().get(id) ?? null;
  const doc = await db.collection(COLLECTION).doc(id).get();
  return doc.exists ? ({ id: doc.id, ...(doc.data() as Omit<Property, "id">) }) : null;
}

export async function createProperty(p: Omit<Property, "id">, id?: string): Promise<string> {
  const db = getDb();
  const docId = id || slugify(p.name) || `prop-${Date.now()}`;
  const record = stripUndefined({ ...p, createdAt: now(), updatedAt: now() });
  if (!db) {
    memStore().set(docId, { id: docId, ...record } as Property);
    return docId;
  }
  await db.collection(COLLECTION).doc(docId).set(record);
  return docId;
}

export async function updateProperty(id: string, patch: Partial<Property>): Promise<void> {
  const db = getDb();
  const clean = stripUndefined({ ...patch, updatedAt: now() });
  if (!db) {
    const cur = memStore().get(id);
    if (cur) memStore().set(id, { ...cur, ...clean } as Property);
    return;
  }
  await db.collection(COLLECTION).doc(id).set(clean, { merge: true });
}

export async function deleteProperty(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const cur = memStore().get(id);
    if (cur) {
      const { id: _omit, ...data } = cur;
      memSnapshots().unshift({ id: `snap-${Date.now()}-${memSnapshots().length}`, propertyId: id, name: cur.name, reason: "delete", takenAt: now(), data });
      memStore().delete(id);
    }
    return;
  }
  // Snapshot the document before deleting so it can be recovered.
  const doc = await db.collection(COLLECTION).doc(id).get();
  if (doc.exists) {
    const data = doc.data() as Omit<Property, "id">;
    await db.collection(SNAPSHOTS).add({ propertyId: id, name: data.name ?? id, reason: "delete", takenAt: now(), data });
  }
  await db.collection(COLLECTION).doc(id).delete();
}

// ── Snapshots (recovery / recycle bin) ───────────────────────────────────────
export async function listSnapshots(): Promise<PropertySnapshot[]> {
  const db = getDb();
  if (!db) return [...memSnapshots()];
  const snap = await db.collection(SNAPSHOTS).orderBy("takenAt", "desc").limit(100).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PropertySnapshot, "id">) }));
}

/** Re-create the property from a snapshot, then remove the snapshot. */
export async function restoreSnapshot(snapshotId: string): Promise<string | null> {
  const db = getDb();
  if (!db) {
    const idx = memSnapshots().findIndex((s) => s.id === snapshotId);
    if (idx === -1) return null;
    const [s] = memSnapshots().splice(idx, 1);
    memStore().set(s.propertyId, { id: s.propertyId, ...s.data } as Property);
    return s.propertyId;
  }
  const ref = db.collection(SNAPSHOTS).doc(snapshotId);
  const doc = await ref.get();
  if (!doc.exists) return null;
  const s = doc.data() as Omit<PropertySnapshot, "id">;
  await db.collection(COLLECTION).doc(s.propertyId).set(stripUndefined(s.data));
  await ref.delete();
  return s.propertyId;
}

/** Permanently discard a snapshot (cannot be recovered afterwards). */
export async function deleteSnapshot(snapshotId: string): Promise<void> {
  const db = getDb();
  if (!db) {
    g.__boudierSnapshots = memSnapshots().filter((s) => s.id !== snapshotId);
    return;
  }
  await db.collection(SNAPSHOTS).doc(snapshotId).delete();
}

// ── Prospects (pre-pipeline leads) ────────────────────────────────────────────
function memLeads(): Lead[] {
  if (!g.__boudierLeads) g.__boudierLeads = [];
  return g.__boudierLeads;
}
export async function listLeads(): Promise<Lead[]> {
  const db = getDb();
  if (!db) return [...memLeads()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const snap = await db.collection(LEADS).orderBy("createdAt", "desc").limit(200).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Lead, "id">) }));
}
export async function getLead(id: string): Promise<Lead | null> {
  const db = getDb();
  if (!db) return memLeads().find((l) => l.id === id) ?? null;
  const doc = await db.collection(LEADS).doc(id).get();
  return doc.exists ? ({ id: doc.id, ...(doc.data() as Omit<Lead, "id">) }) : null;
}
export async function leadExistsForUrl(url: string): Promise<boolean> {
  if (!url) return false;
  const db = getDb();
  if (!db) return memLeads().some((l) => l.url === url);
  const snap = await db.collection(LEADS).where("url", "==", url).limit(1).get();
  return !snap.empty;
}
export async function addLead(lead: Omit<Lead, "id">): Promise<string> {
  const db = getDb();
  const clean = stripUndefined(lead);
  if (!db) {
    const id = `lead-${Date.now()}-${memLeads().length}`;
    memLeads().unshift({ id, ...clean } as Lead);
    return id;
  }
  const ref = await db.collection(LEADS).add(clean);
  return ref.id;
}
export async function updateLead(id: string, patch: Partial<Lead>): Promise<void> {
  const db = getDb();
  const clean = stripUndefined({ ...patch, updatedAt: now() });
  if (!db) {
    const l = memLeads().find((x) => x.id === id);
    if (l) Object.assign(l, clean);
    return;
  }
  await db.collection(LEADS).doc(id).set(clean, { merge: true });
}
export async function deleteLead(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    g.__boudierLeads = memLeads().filter((l) => l.id !== id);
    return;
  }
  await db.collection(LEADS).doc(id).delete();
}

// ── Watchlist (agent pages to monitor) ────────────────────────────────────────
function memWatch(): WatchSource[] {
  if (!g.__boudierWatch) g.__boudierWatch = [];
  return g.__boudierWatch;
}
export async function listWatch(): Promise<WatchSource[]> {
  const db = getDb();
  if (!db) return [...memWatch()];
  const snap = await db.collection(WATCHLIST).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WatchSource, "id">) }));
}
export async function addWatch(w: Omit<WatchSource, "id">): Promise<string> {
  const db = getDb();
  if (!db) {
    const id = `watch-${Date.now()}`;
    memWatch().push({ id, ...w });
    return id;
  }
  const ref = await db.collection(WATCHLIST).add(stripUndefined(w));
  return ref.id;
}
export async function deleteWatch(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    g.__boudierWatch = memWatch().filter((w) => w.id !== id);
    return;
  }
  await db.collection(WATCHLIST).doc(id).delete();
}
export async function touchWatch(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const w = memWatch().find((x) => x.id === id);
    if (w) w.lastScanAt = now();
    return;
  }
  await db.collection(WATCHLIST).doc(id).set({ lastScanAt: now() }, { merge: true });
}
export async function saveWatchResult(id: string, result: WatchResult): Promise<void> {
  const db = getDb();
  if (!db) {
    const w = memWatch().find((x) => x.id === id);
    if (w) {
      w.lastResult = result;
      w.lastScanAt = result.scannedAt;
    }
    return;
  }
  await db.collection(WATCHLIST).doc(id).set({ lastResult: stripUndefined(result), lastScanAt: result.scannedAt }, { merge: true });
}

// ── Ignored listings (deleted prospects — never auto-add again) ────────────────
const IGNORED = "ignored";
export interface IgnoredUrl {
  url: string;
  name?: string;
  reason?: string;
  at: string;
}
function memIgnored(): IgnoredUrl[] {
  if (!g.__boudierIgnored) g.__boudierIgnored = [];
  return g.__boudierIgnored;
}
export async function addIgnoredUrl(url: string, name?: string, reason?: string): Promise<void> {
  if (!url) return;
  const db = getDb();
  const rec: IgnoredUrl = stripUndefined({ url, name: name || "", reason: reason || "deleted", at: now() });
  if (!db) {
    if (!memIgnored().some((i) => i.url === url)) memIgnored().unshift(rec);
    return;
  }
  // Key the doc by the URL so re-deleting the same listing just overwrites.
  await db.collection(IGNORED).doc(slugify(url) || `ign-${Date.now()}`).set(rec);
}
export async function ignoredUrlSet(): Promise<Set<string>> {
  const db = getDb();
  if (!db) return new Set(memIgnored().map((i) => i.url));
  const snap = await db.collection(IGNORED).limit(2000).get();
  return new Set(snap.docs.map((d) => (d.data() as IgnoredUrl).url).filter(Boolean));
}

// ── Contacts (address book) ───────────────────────────────────────────────────
const CONTACTS = "contacts";
function memContacts(): Contact[] {
  if (!g.__boudierContacts) g.__boudierContacts = [];
  return g.__boudierContacts;
}
export async function listContacts(): Promise<Contact[]> {
  const db = getDb();
  if (!db) return [...memContacts()].sort((a, b) => a.name.localeCompare(b.name));
  const snap = await db.collection(CONTACTS).limit(2000).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Contact, "id">) }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}
export async function addContact(c: Omit<Contact, "id">): Promise<string> {
  const db = getDb();
  const clean = stripUndefined({ ...c, createdAt: now() });
  if (!db) {
    const id = `contact-${Date.now()}-${memContacts().length}`;
    memContacts().unshift({ id, ...clean } as Contact);
    return id;
  }
  const ref = await db.collection(CONTACTS).add(clean);
  return ref.id;
}
export async function updateContact(id: string, patch: Partial<Contact>): Promise<void> {
  const db = getDb();
  const clean = stripUndefined({ ...patch, updatedAt: now() });
  if (!db) {
    const c = memContacts().find((x) => x.id === id);
    if (c) Object.assign(c, clean);
    return;
  }
  await db.collection(CONTACTS).doc(id).set(clean, { merge: true });
}
export async function deleteContact(id: string): Promise<void> {
  const db = getDb();
  if (!db) {
    g.__boudierContacts = memContacts().filter((c) => c.id !== id);
    return;
  }
  await db.collection(CONTACTS).doc(id).delete();
}

// ── Monitor criteria (editable filter) ────────────────────────────────────────
export async function getMonitorCriteria(): Promise<MonitorCriteria> {
  const db = getDb();
  if (!db) return g.__boudierCriteria ?? DEFAULT_CRITERIA;
  const doc = await db.collection("config").doc("monitor").get();
  return doc.exists ? { ...DEFAULT_CRITERIA, ...(doc.data() as Partial<MonitorCriteria>) } : DEFAULT_CRITERIA;
}
export async function saveMonitorCriteria(c: MonitorCriteria): Promise<void> {
  const db = getDb();
  if (!db) {
    g.__boudierCriteria = c;
    return;
  }
  await db.collection("config").doc("monitor").set(stripUndefined(c));
}

export async function saveDcas(id: string, dcas: Dcas) {
  await updateProperty(id, { dcas: { ...dcas, updatedAt: now() } });
}
export async function saveMac(id: string, mac: Mac) {
  await updateProperty(id, { mac: { ...mac, updatedAt: now() } });
}
export async function saveIpad(id: string, ipad: Ipad) {
  await updateProperty(id, { ipad: { ...ipad, updatedAt: now() } });
}

// ── Settings ─────────────────────────────────────────────────────────────────
export async function getSettings(): Promise<ProcedabilitySettings> {
  const db = getDb();
  if (!db) return g.__boudierSettings ?? DEFAULT_SETTINGS;
  const doc = await db.doc(SETTINGS_DOC.join("/")).get();
  return doc.exists ? ({ ...DEFAULT_SETTINGS, ...(doc.data() as ProcedabilitySettings) }) : DEFAULT_SETTINGS;
}

export async function saveSettings(s: ProcedabilitySettings): Promise<void> {
  const db = getDb();
  if (!db) {
    g.__boudierSettings = s;
    return;
  }
  await db.doc(SETTINGS_DOC.join("/")).set(stripUndefined(s), { merge: true });
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
