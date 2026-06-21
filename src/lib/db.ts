import "server-only";
import type { Property, ProcedabilitySettings, Dcas, Mac, Ipad, PropertySnapshot } from "./types";
import { getDb, isFirestoreConfigured } from "./firebaseAdmin";
import { SEED_PROPERTIES } from "./seedData";
import { DEFAULT_SETTINGS } from "./procedability";

const COLLECTION = "properties";
const SNAPSHOTS = "snapshots";

// Shared OneDrive root where per-site document folders live (fallback link for
// the Documents button until a site has its own folder URL).
export const ONEDRIVE_ROOT =
  "https://actsyslimited-my.sharepoint.com/:f:/g/personal/vanessa_changes4life_co_uk/IgB7THi35r1OQ7RRxtYfbm2SAXjNtLJgfI2c070JLyroL_0?e=0CsNck";
const SETTINGS_DOC = ["settings", "procedability"] as const;

// ── In-memory demo store (used when Firestore isn't configured) ──────────────
// Persists within a single running process (great for `next dev`). Serverless
// instances are stateless, so connect Firestore for durable persistence.
const g = globalThis as unknown as {
  __boudierStore?: Map<string, Property>;
  __boudierSettings?: ProcedabilitySettings;
  __boudierSnapshots?: PropertySnapshot[];
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
