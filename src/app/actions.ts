"use server";

import { revalidatePath } from "next/cache";
import type { Dcas, Ipad, Mac, Property, ProcedabilitySettings } from "@/lib/types";
import {
  createProperty,
  deleteProperty,
  deleteSnapshot,
  getProperty,
  listSnapshots,
  restoreSnapshot,
  saveDcas,
  saveIpad,
  saveMac,
  saveSettings,
  updateProperty,
} from "@/lib/db";

export async function actionSaveDcas(id: string, dcas: Dcas) {
  await saveDcas(id, dcas);
  revalidatePath(`/property/${id}`);
  revalidatePath(`/`);
  return { ok: true };
}

export async function actionSaveMac(id: string, mac: Mac) {
  await saveMac(id, mac);
  revalidatePath(`/property/${id}`);
  revalidatePath(`/`);
  return { ok: true };
}

export async function actionSaveIpad(id: string, ipad: Ipad) {
  await saveIpad(id, ipad);
  revalidatePath(`/property/${id}`);
  revalidatePath(`/`);
  return { ok: true };
}

export async function actionUpdateProperty(id: string, patch: Partial<Property>) {
  await updateProperty(id, patch);
  revalidatePath(`/property/${id}`);
  revalidatePath(`/`);
  return { ok: true };
}

export async function actionCreateProperty(p: Omit<Property, "id">) {
  const id = await createProperty(p);
  // Create the site's OneDrive folder + subfolders (no-op until Graph is
  // configured). Never let a folder failure break site creation.
  try {
    const { createSiteFolders } = await import("@/lib/onedrive");
    const url = await createSiteFolders(p.name);
    if (url) await updateProperty(id, { documentsUrl: url });
  } catch (e) {
    console.error("OneDrive folder creation failed:", e);
  }
  revalidatePath(`/`);
  return { ok: true, id };
}

export async function actionDeleteProperty(id: string) {
  await deleteProperty(id);
  revalidatePath(`/`);
  revalidatePath(`/property/${id}`);
  revalidatePath(`/recover`);
  return { ok: true };
}

export async function actionListSnapshots() {
  return listSnapshots();
}

export async function actionRestoreSnapshot(snapshotId: string) {
  const id = await restoreSnapshot(snapshotId);
  revalidatePath(`/`);
  revalidatePath(`/recover`);
  return { ok: !!id, id };
}

export async function actionDeleteSnapshot(snapshotId: string) {
  await deleteSnapshot(snapshotId);
  revalidatePath(`/recover`);
  return { ok: true };
}

export async function actionSaveSettings(s: ProcedabilitySettings) {
  await saveSettings(s);
  revalidatePath(`/`);
  revalidatePath(`/settings`);
  return { ok: true };
}

export async function actionGetProperty(id: string) {
  return getProperty(id);
}

// ── Passkeys (Touch ID / WebAuthn) — register/authenticate live in route
// handlers (/api/passkey/*) so cookies are set reliably; list/delete are here.
export async function actionListPasskeys() {
  const { listPasskeys } = await import("@/lib/db");
  return (await listPasskeys()).map((p) => ({ id: p.id, label: p.label, createdAt: p.createdAt }));
}
export async function actionDeletePasskey(id: string) {
  const { deletePasskey } = await import("@/lib/db");
  await deletePasskey(id);
  return { ok: true };
}

export async function actionImportListing(input: { url?: string; html?: string }) {
  const { importListing } = await import("@/lib/importListing");
  return importListing(input);
}
