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

export async function actionImportListing(input: { url?: string; html?: string }) {
  const { importListing } = await import("@/lib/importListing");
  return importListing(input);
}
