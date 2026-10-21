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
  saveMonitorCriteria,
  addIgnoredUrl,
  listContacts,
  addContact,
  updateContact,
  deleteContact,
} from "@/lib/db";
import type { MonitorCriteria, Contact, TitleSplitStage } from "@/lib/types";
import { classifyKind } from "@/lib/prospectKind";

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

export async function actionSetStatusOverride(id: string, status: Property["statusOverride"]) {
  await updateProperty(id, { statusOverride: status ?? null });
  revalidatePath(`/`);
  revalidatePath(`/property/${id}`);
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
    kind: classifyKind(f),
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
    marketStatus: f.marketStatus || "",
    statusCheckedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  revalidateProspects();
  return { ok: true, id };
}

export async function actionSetProspectStatus(id: string, status: "new" | "reviewing" | "rejected") {
  await updateLead(id, { status });
  revalidateProspects();
  return { ok: true };
}

export async function actionDeleteProspect(id: string) {
  // Remember the listing URL so the auto-monitor never re-adds it.
  const lead = await getLead(id);
  await deleteLead(id);
  if (lead?.url) await addIgnoredUrl(lead.url, lead.name, "deleted prospect");
  revalidateProspects();
  return { ok: true };
}

export async function actionPromoteProspect(id: string) {
  const lead = await getLead(id);
  if (!lead) return { ok: false as const };
  // Already promoted and the property still exists → reuse it, never recreate
  // (recreating would overwrite any DCAS/MAC/IPAD already captured there).
  if (lead.promotedPropertyId) {
    const existing = await getProperty(lead.promotedPropertyId);
    if (existing) return { ok: true as const, propertyId: existing.id };
  }
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
    marketStatus: lead.marketStatus || "",
    statusCheckedAt: lead.statusCheckedAt || new Date().toISOString(),
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
  revalidateProspects();
  return { ok: true as const, propertyId };
}

// ── Watchlist (auto-monitor) ──────────────────────────────────────────────────
export async function actionListWatch() {
  return listWatch();
}
// Prospects live at /prospects/commercial and /prospects/residential.
function revalidateProspects() {
  revalidatePath("/prospects/commercial");
  revalidatePath("/prospects/residential");
}

export async function actionAddWatch(label: string, url: string, kind: "commercial" | "residential" = "commercial") {
  if (!url.trim()) return { ok: false };
  await addWatch({ label: label.trim() || url, url: url.trim(), kind, createdAt: new Date().toISOString() });
  revalidateProspects();
  return { ok: true };
}
export async function actionDeleteWatch(id: string) {
  await deleteWatch(id);
  revalidateProspects();
  return { ok: true };
}
export async function actionSaveCriteria(kind: "commercial" | "residential", criteria: MonitorCriteria) {
  await saveMonitorCriteria(kind, criteria);
  revalidateProspects();
  return { ok: true };
}

// ── Insolvency sourcing (Companies House) ─────────────────────────────────────
export async function actionScanInsolvency(opts?: { national?: boolean }) {
  const { scanInsolvency } = await import("@/lib/companiesHouse");
  const result = await scanInsolvency(opts);
  revalidateProspects();
  return result;
}

// ── Availability monitoring (sold / back-on-market) ───────────────────────────
export async function actionScanNow() {
  const { runScan } = await import("@/lib/scan");
  const summary = await runScan();
  revalidateProspects();
  revalidatePath(`/`);
  return summary;
}

export async function actionClearLeadAlert(id: string) {
  await updateLead(id, { alert: null });
  revalidateProspects();
  return { ok: true };
}

export async function actionClearPropertyAlert(id: string) {
  await updateProperty(id, { alert: null });
  revalidatePath(`/`);
  revalidatePath(`/property/${id}`);
  return { ok: true };
}

export async function actionImportListing(input: { url?: string; html?: string }) {
  const { importListing } = await import("@/lib/importListing");
  return importListing(input);
}

// ── Contacts ──────────────────────────────────────────────────────────────────
const EMPTY_CONTACT: Omit<Contact, "id" | "createdAt"> = {
  name: "", company: "", jobTitle: "", category: "", email: "", phone: "",
  mobile: "", website: "", address: "", notes: "", cardImageUrl: "",
};

export async function actionListContacts() {
  return listContacts();
}

export async function actionAddContact(input: Partial<Contact>) {
  const c = { ...EMPTY_CONTACT, ...input, name: (input.name || "").trim() || "Unnamed contact", createdAt: new Date().toISOString() };
  const id = await addContact(c);
  revalidatePath(`/contacts`);
  return { ok: true, id };
}

export async function actionUpdateContact(id: string, patch: Partial<Contact>) {
  await updateContact(id, patch);
  revalidatePath(`/contacts`);
  return { ok: true };
}

export async function actionDeleteContact(id: string) {
  await deleteContact(id);
  revalidatePath(`/contacts`);
  return { ok: true };
}

// Read a business card image (data URL) and return the extracted fields.
export async function actionScanCard(imageDataUrl: string) {
  const { extractContactCard, isAIConfigured } = await import("@/lib/ai");
  if (!isAIConfigured()) return { ok: false as const, error: "AI key not configured." };
  try {
    const fields = await extractContactCard(imageDataUrl);
    if (!fields) return { ok: false as const, error: "Couldn't read the card. Try a clearer photo." };
    return { ok: true as const, fields };
  } catch (e) {
    console.error("Card scan failed:", e);
    return { ok: false as const, error: "Card scan failed. Try again or enter the details manually." };
  }
}

// ── AI research agent (auto-fill sections) ────────────────────────────────────
export async function actionResearchDcas(id: string) {
  const p = await getProperty(id);
  if (!p) return { ok: false as const, error: "Property not found." };
  const { researchDcas, appendNotes } = await import("@/lib/research");
  const r = await researchDcas(p);
  if (!r) return { ok: false as const, error: "Research failed — check the AI key has credit." };
  if (r.notes) await updateProperty(id, { notes: appendNotes(p.notes, "DCAS", r.notes) });
  revalidatePath(`/`);
  revalidatePath(`/property/${id}`);
  return { ok: true as const, items: r.items, notes: r.notes };
}

export async function actionResearchMac(id: string) {
  const p = await getProperty(id);
  if (!p) return { ok: false as const, error: "Property not found." };
  const { researchMac, appendNotes } = await import("@/lib/research");
  const r = await researchMac(p);
  if (!r) return { ok: false as const, error: "Research failed — check the AI key has credit." };
  if (r.notes) await updateProperty(id, { notes: appendNotes(p.notes, "MAC", r.notes) });
  revalidatePath(`/`);
  revalidatePath(`/property/${id}`);
  return { ok: true as const, searchArea: r.searchArea, propertyType: r.propertyType, comps: r.comps, notes: r.notes };
}

export async function actionResearchIpad(id: string) {
  const p = await getProperty(id);
  if (!p) return { ok: false as const, error: "Property not found." };
  const { researchIpad, appendNotes } = await import("@/lib/research");
  const r = await researchIpad(p);
  if (!r) return { ok: false as const, error: "Research failed — check the AI key has credit." };
  if (r.notes) await updateProperty(id, { notes: appendNotes(p.notes, "IPAD", r.notes) });
  revalidatePath(`/`);
  revalidatePath(`/property/${id}`);
  return {
    ok: true as const,
    purchasePrice: r.purchasePrice,
    areaM2: r.areaM2,
    newBuildRatePerM2: r.newBuildRatePerM2,
    commercialRatePerM2: r.commercialRatePerM2,
    contingencyPct: r.contingencyPct,
    units: r.units,
    notes: r.notes,
  };
}

// ── Project Management — Microsoft Graph (calendar + To Do) ───────────────────
/** Hand editing back to the app after an Excel export (clears the lock). */
export async function actionRevertIpadToApp(propertyId: string) {
  await updateProperty(propertyId, { ipadExcelUrl: "", ipadExcelAt: "" });
  revalidatePath(`/property/${propertyId}/ipad`);
  revalidatePath(`/property/${propertyId}/ipad/table`);
  return { ok: true as const };
}

export async function actionCreateCalendarEvent(input: {
  subject: string;
  start: string;
  end: string;
  location?: string;
  allDay?: boolean;
  teams?: boolean;
}) {
  try {
    if (input.teams) {
      // Real Teams meeting on the organiser's calendar; invite Vanessa so it
      // still appears on the shared project calendar.
      const { createTeamsMeeting, PROJECTS_OWNER } = await import("@/lib/graph");
      const m = await createTeamsMeeting({ subject: input.subject, start: input.start, end: input.end, attendees: [PROJECTS_OWNER] });
      revalidatePath("/projects");
      return { ok: true as const, joinUrl: m.joinUrl };
    }
    const { createEvent } = await import("@/lib/graph");
    const ev = await createEvent(input);
    revalidatePath("/projects");
    return { ok: true as const, event: ev };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to add event" };
  }
}

export async function actionScheduleMeeting(input: {
  subject: string;
  start: string;
  end: string;
  attendees: string[];
}) {
  try {
    const { createTeamsMeeting } = await import("@/lib/graph");
    const meeting = await createTeamsMeeting(input);
    const { addRecentAttendees } = await import("@/lib/db");
    await addRecentAttendees(input.attendees.map((email) => ({ email })));
    revalidatePath("/projects");
    return { ok: true as const, meeting };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to schedule the meeting" };
  }
}

/** Combined attendee suggestions for the scheduler: contact emails + any
 * previously-used attendee addresses, deduped. */
export async function actionAttendeeSuggestions(): Promise<{ email: string; name: string }[]> {
  const { listContacts, getRecentAttendees } = await import("@/lib/db");
  const [contacts, recent] = await Promise.all([listContacts(), getRecentAttendees()]);
  const map = new Map<string, { email: string; name: string }>();
  for (const c of contacts) {
    if (c.email) map.set(c.email.toLowerCase(), { email: c.email, name: c.name || c.company || "" });
  }
  for (const r of recent) {
    if (r.email && !map.has(r.email.toLowerCase())) map.set(r.email.toLowerCase(), r);
  }
  return [...map.values()];
}

export async function actionCreateTask(listId: string, title: string, due?: string) {
  try {
    const { createTask } = await import("@/lib/graph");
    const task = await createTask(listId, title, due);
    revalidatePath("/projects");
    return { ok: true as const, task };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to add task" };
  }
}

export async function actionSetTaskCompleted(listId: string, taskId: string, completed: boolean) {
  try {
    const { setTaskCompleted } = await import("@/lib/graph");
    await setTaskCompleted(listId, taskId, completed);
    revalidatePath("/projects");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed to update task" };
  }
}

/** Move a prospect between the commercial and residential areas. */
export async function actionSetLeadKind(id: string, kind: "commercial" | "residential") {
  await updateLead(id, { kind });
  revalidateProspects();
  return { ok: true as const };
}

// ── Unbroken Freehold Finder ─────────────────────────────────────────────────

/**
 * Promote a freehold candidate to the pipeline (plan §6 "Add to Pipeline").
 * Creates the same kind of property record as promoting a prospect, with a
 * DCAS draft seeded from what the finder knows, then records the link on the
 * candidate so the map shows it as already in the pipeline.
 */
export async function actionAddFreeholdToPipeline(candidateId: number) {
  const { getFreehold, markInPipeline, titleBoundaryUrl, LA_NAMES } = await import("@/lib/freeholds");
  const { emptyDcas } = await import("@/lib/dcasSchema");
  const c = await getFreehold(candidateId);
  if (!c) return { ok: false as const, error: "Candidate not found." };
  if (c.pipelinePropertyId) return { ok: true as const, propertyId: c.pipelinePropertyId, already: true };

  const area = LA_NAMES[c.laCode] ? null : await (await import("@/lib/freeholds")).getArea(c.laCode);
  const la = LA_NAMES[c.laCode] ?? { town: area?.laName ?? "", lpa: area?.laName ?? "" };
  const name = c.sampleAddresses[0] || `Freehold ${c.inspireId}`;
  const owner =
    c.ownerType === "private"
      ? `Private owner${c.ownerTypeInferred ? " (inferred — no company match; confirm via title register)" : ""}`
      : `${c.ownerType === "overseas" ? "Overseas company" : "Company"}: ${c.companyName ?? "unknown"}` +
        (c.companyNumber ? ` (${c.companyNumber})` : "") +
        (c.companyAddress ? `\nWrite to: ${c.companyAddress}` : "");
  const notes = [
    `Unbroken freehold candidate — ${c.addressCount} addresses, ${c.leaseCount} registered leases, ${c.epcUprnCount} UPRNs with an EPC (${c.epcCertCount} certificates).`,
    `Use classes: ${c.useClasses.join(", ") || "not identified"}. Confidence ${Math.round(c.confidence * 100)}%.`,
    owner,
    c.sampleAddresses.length ? `Addresses: ${c.sampleAddresses.join("; ")}` : "",
    c.lastSalePrice ? `Last sale: £${c.lastSalePrice.toLocaleString("en-GB")} on ${c.lastSaleDate ?? "?"}` : "",
    `INSPIRE ${c.inspireId} — ${titleBoundaryUrl(c.inspireId)}`,
    "Counts are Phase 1 spatial-join proxies (see docs/unbroken-freehold-finder-PLAN.md §4); confirm against the title register before relying on them.",
  ].filter(Boolean).join("\n");

  const propertyId = await createProperty({
    name,
    town: la.town,
    lpa: la.lpa,
    guidePrice: null,
    sizeSqFt: null,
    pricePerSqFt: null,
    currentUse: c.useClasses.length ? `Residential — ${c.useClasses.join("/")} (${c.addressCount} units)` : "",
    heritage: "",
    pdRoute: "",
    fullPlanningRoute: "",
    keyConstraints: "",
    planningPrinciple: "",
    likelyOutcome: "",
    priorityNextStep: c.ownerType === "private" ? "Buy title register to confirm owner; prepare approach letter" : "Prepare approach letter to company address",
    listingSource: "Unbroken Freehold Finder",
    listingUrl: titleBoundaryUrl(c.inspireId),
    notes,
    dcas: emptyDcas(`Unbroken freehold — ${c.addressCount} units on one title`, name, new Date().toISOString().slice(0, 10)),
    // Its own pipeline: a title split is not a site appraisal.
    pipeline: "title-split",
    titleSplit: {
      stage: "identified",
      candidateId: c.id,
      inspireId: c.inspireId,
      laCode: c.laCode,
      addressCount: c.addressCount,
      leaseCount: c.leaseCount,
      epcUprnCount: c.epcUprnCount,
      ownerType: c.ownerType,
      ownerTypeInferred: c.ownerTypeInferred,
      companyName: c.companyName,
      companyNumber: c.companyNumber,
      companyAddress: c.companyAddress,
      confidence: c.confidence,
      sampleAddresses: c.sampleAddresses,
      stageUpdatedAt: new Date().toISOString(),
    },
  });
  try {
    const { createSiteFolders } = await import("@/lib/onedrive");
    const url = await createSiteFolders(name);
    if (url) await updateProperty(propertyId, { documentsUrl: url });
  } catch (e) {
    console.error("OneDrive folder creation failed:", e);
  }
  await markInPipeline(candidateId, propertyId);
  revalidatePath("/freeholds");
  revalidatePath("/title-split");
  return { ok: true as const, propertyId, already: false };
}

/** Move a Title Split opportunity to another stage. */
export async function actionSetTitleSplitStage(propertyId: string, stage: TitleSplitStage) {
  const p = await getProperty(propertyId);
  if (!p?.titleSplit) return { ok: false as const, error: "Not a Title Split opportunity." };
  const now = new Date().toISOString();
  await updateProperty(propertyId, {
    titleSplit: {
      ...p.titleSplit,
      stage,
      stageUpdatedAt: now,
      // Record the first time a letter went, so follow-ups can be timed from it.
      letterSentAt: stage === "letter-sent" && !p.titleSplit.letterSentAt ? now : p.titleSplit.letterSentAt,
    },
  });
  revalidatePath("/title-split");
  revalidatePath(`/property/${propertyId}`);
  return { ok: true as const };
}

/** Start an on-demand import for a council found by searching the map. */
export async function actionRequestAreaImport(laCode: string, laName: string, lat: number | null, lng: number | null) {
  const { requestImport } = await import("@/lib/freeholds");
  const r = await requestImport(laCode, laName, lat, lng);
  revalidatePath("/freeholds");
  return r;
}
