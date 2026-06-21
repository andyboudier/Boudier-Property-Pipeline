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
  listLeads,
  getLead,
  addLead,
  updateLead,
  deleteLead,
  listWatch,
  addWatch,
  deleteWatch,
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

export async function actionSaveInvestor(id: string, investor: import("@/lib/types").InvestorTerms) {
  await updateProperty(id, { investor: { ...investor, updatedAt: new Date().toISOString() } });
  revalidatePath(`/property/${id}`);
  revalidatePath(`/property/${id}/investor`);
  revalidatePath(`/property/${id}/presentation`);
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
  const existing = await getProperty(id);
  await deleteProperty(id);
  // Archive the site's OneDrive folder (move into "Archive"). Non-blocking and
  // a no-op until Graph is configured.
  if (existing?.name) {
    try {
      const { archiveSiteFolder } = await import("@/lib/onedrive");
      await archiveSiteFolder(existing.name);
    } catch (e) {
      console.error("OneDrive archive failed:", e);
    }
  }
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
  // Move the site's OneDrive folder back out of "Archive" and re-point its
  // Documents link. Non-blocking; inert until Graph is configured.
  if (id) {
    try {
      const p = await getProperty(id);
      if (p?.name) {
        const { unarchiveSiteFolder } = await import("@/lib/onedrive");
        const url = await unarchiveSiteFolder(p.name);
        if (url) await updateProperty(id, { documentsUrl: url });
      }
    } catch (e) {
      console.error("OneDrive un-archive failed:", e);
    }
  }
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

// ── Prospects (pre-pipeline) ──────────────────────────────────────────────────
export async function actionListProspects() {
  return listLeads();
}

export async function actionAddProspect(input: { url?: string; html?: string }) {
  const { importListing } = await import("@/lib/importListing");
  const res = await importListing(input);
  if (!res.ok) return { ok: false, blocked: res.blocked, warning: res.warning };
  const f = res.fields;
  const id = await addLead({
    status: "new",
    source: f.listingSource || res.source || "Web",
    url: f.listingUrl || input.url || "",
    name: f.name || "Untitled listing",
    town: f.town || "",
    guidePrice: f.guidePrice ?? null,
    sizeSqFt: f.sizeSqFt ?? null,
    pricePerSqFt: f.pricePerSqFt ?? null,
    currentUse: f.currentUse || "",
    notes: f.notes || "",
    imageUrl: f.imageUrl || "",
    createdAt: new Date().toISOString(),
  });
  revalidatePath(`/prospects`);
  return { ok: true, id };
}

export async function actionSetProspectStatus(id: string, status: "new" | "reviewing" | "rejected") {
  await updateLead(id, { status });
  revalidatePath(`/prospects`);
  return { ok: true };
}

export async function actionDeleteProspect(id: string) {
  await deleteLead(id);
  revalidatePath(`/prospects`);
  return { ok: true };
}

export async function actionPromoteProspect(id: string) {
  const lead = await getLead(id);
  if (!lead) return { ok: false as const };
  const propertyId = await createProperty({
    name: lead.name || "Untitled site",
    town: lead.town || "",
    lpa: "",
    guidePrice: lead.guidePrice ?? null,
    sizeSqFt: lead.sizeSqFt ?? null,
    pricePerSqFt: lead.pricePerSqFt ?? (lead.guidePrice && lead.sizeSqFt ? Math.round(lead.guidePrice / lead.sizeSqFt) : null),
    currentUse: lead.currentUse || "",
    heritage: "",
    pdRoute: "",
    fullPlanningRoute: "",
    keyConstraints: "",
    planningPrinciple: "",
    likelyOutcome: "",
    priorityNextStep: "",
    listingSource: lead.source || "",
    listingUrl: lead.url || "",
    notes: lead.notes || "",
    imageUrl: lead.imageUrl || "",
  });
  // Create the site's OneDrive folder (no-op until Graph configured).
  try {
    const { createSiteFolders } = await import("@/lib/onedrive");
    const url = await createSiteFolders(lead.name || "Untitled site");
    if (url) await updateProperty(propertyId, { documentsUrl: url });
  } catch (e) {
    console.error("OneDrive folder creation failed:", e);
  }
  await updateLead(id, { status: "promoted", promotedPropertyId: propertyId });
  revalidatePath(`/`);
  revalidatePath(`/prospects`);
  return { ok: true as const, propertyId };
}

// ── Watchlist (auto-monitor) ──────────────────────────────────────────────────
export async function actionListWatch() {
  return listWatch();
}
export async function actionAddWatch(label: string, url: string) {
  if (!url.trim()) return { ok: false };
  await addWatch({ label: label.trim() || url, url: url.trim(), createdAt: new Date().toISOString() });
  revalidatePath(`/prospects`);
  return { ok: true };
}
export async function actionDeleteWatch(id: string) {
  await deleteWatch(id);
  revalidatePath(`/prospects`);
  return { ok: true };
}

export async function actionImportListing(input: { url?: string; html?: string }) {
  const { importListing } = await import("@/lib/importListing");
  return importListing(input);
}
