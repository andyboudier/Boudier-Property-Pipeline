import "server-only";
import { ONEDRIVE_ROOT, SITE_SUBFOLDERS } from "./constants";

// ──────────────────────────────────────────────────────────────────────────
// Microsoft Graph integration — creates a per-site folder (named by address)
// with the standard subfolders under a shared OneDrive folder. App-only auth
// (client credentials). Stays inert unless MS_TENANT_ID / MS_CLIENT_ID /
// MS_CLIENT_SECRET are configured, so the app runs fine before Azure setup.
//
// Azure setup (one-off, by the M365 admin):
//   1. Entra ID → App registrations → New registration.
//   2. API permissions → Microsoft Graph → Application → Files.ReadWrite.All
//      → Grant admin consent.
//   3. Certificates & secrets → new client secret.
//   4. Put Tenant ID / Application (client) ID / secret in Vercel env vars:
//      MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
//      (optional: ONEDRIVE_ROOT_SHARE_URL to override the target folder).
// ──────────────────────────────────────────────────────────────────────────

const GRAPH = "https://graph.microsoft.com/v1.0";

function creds() {
  const tenant = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) return null;
  return { tenant, clientId, clientSecret };
}

export function isOneDriveConfigured() {
  return creds() !== null;
}

async function getToken(): Promise<string> {
  const c = creds();
  if (!c) throw new Error("OneDrive not configured");
  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Graph token failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token as string;
}

// Encode a sharing URL into the Graph /shares/{id} token form.
function encodeShareUrl(url: string): string {
  const b64 = Buffer.from(url).toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  return `u!${b64}`;
}

async function resolveShare(token: string, shareUrl: string): Promise<{ driveId: string; itemId: string }> {
  const res = await fetch(`${GRAPH}/shares/${encodeShareUrl(shareUrl)}/driveItem?$select=id,parentReference`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph resolve share failed: ${res.status} ${await res.text()}`);
  const item = await res.json();
  const driveId = item?.parentReference?.driveId;
  if (!driveId || !item?.id) throw new Error("Could not resolve OneDrive folder from share link");
  return { driveId, itemId: item.id };
}

// OneDrive forbids \ / : * ? " < > | and trailing dots/spaces in names.
function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").replace(/[ .]+$/, "").trim().slice(0, 120) || "Untitled site";
}

type DriveChild = { id: string; name: string; webUrl: string };

async function listChildren(token: string, driveId: string, parentId: string): Promise<DriveChild[]> {
  const res = await fetch(`${GRAPH}/drives/${driveId}/items/${parentId}/children?$select=id,name,webUrl&$top=999`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return ((await res.json()).value ?? []) as DriveChild[];
}

async function createOrGetFolder(token: string, driveId: string, parentId: string, name: string) {
  const res = await fetch(`${GRAPH}/drives/${driveId}/items/${parentId}/children`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  if (res.ok) return (await res.json()) as DriveChild;
  if (res.status === 409) {
    const found = (await listChildren(token, driveId, parentId)).find((c) => c.name === name);
    if (found) return found;
  }
  throw new Error(`Graph create folder "${name}" failed: ${res.status} ${await res.text()}`);
}

/**
 * Create (or reuse) the site's folder + standard subfolders under the shared
 * OneDrive root. Returns the site folder's webUrl, or null if not configured.
 */
export async function createSiteFolders(siteName: string): Promise<string | null> {
  if (!isOneDriveConfigured()) return null;
  const token = await getToken();
  const rootUrl = process.env.ONEDRIVE_ROOT_SHARE_URL || ONEDRIVE_ROOT;
  const root = await resolveShare(token, rootUrl);
  const siteFolder = await createOrGetFolder(token, root.driveId, root.itemId, sanitizeName(siteName));
  for (const sub of SITE_SUBFOLDERS) {
    try {
      await createOrGetFolder(token, root.driveId, siteFolder.id, sub);
    } catch {
      /* a subfolder failing shouldn't abort the rest */
    }
  }
  return siteFolder.webUrl;
}

/**
 * Move a deleted site's folder into an "Archive" folder under the shared root.
 * Returns true if a folder was archived, false if none was found / not configured.
 */
export async function archiveSiteFolder(siteName: string): Promise<boolean> {
  if (!isOneDriveConfigured()) return false;
  const token = await getToken();
  const rootUrl = process.env.ONEDRIVE_ROOT_SHARE_URL || ONEDRIVE_ROOT;
  const root = await resolveShare(token, rootUrl);
  const safe = sanitizeName(siteName);

  const site = (await listChildren(token, root.driveId, root.itemId)).find((c) => c.name === safe);
  if (!site) return false; // nothing to archive

  const archive = await createOrGetFolder(token, root.driveId, root.itemId, "Archive");

  const move = (body: object) =>
    fetch(`${GRAPH}/drives/${root.driveId}/items/${site.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  let res = await move({ parentReference: { id: archive.id } });
  if (res.status === 409) {
    // a folder with that name already sits in Archive — disambiguate with a stamp
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    res = await move({ parentReference: { id: archive.id }, name: `${safe} (archived ${stamp})` });
  }
  if (!res.ok) throw new Error(`Graph archive move failed: ${res.status} ${await res.text()}`);
  return true;
}

/**
 * Move a restored site's folder back out of "Archive" to the shared root.
 * Returns the folder's new webUrl, or null if not configured / not found.
 */
export async function unarchiveSiteFolder(siteName: string): Promise<string | null> {
  if (!isOneDriveConfigured()) return null;
  const token = await getToken();
  const rootUrl = process.env.ONEDRIVE_ROOT_SHARE_URL || ONEDRIVE_ROOT;
  const root = await resolveShare(token, rootUrl);
  const safe = sanitizeName(siteName);

  const archive = (await listChildren(token, root.driveId, root.itemId)).find((c) => c.name === "Archive");
  if (!archive) return null;

  const inArchive = await listChildren(token, root.driveId, archive.id);
  // exact name, else the timestamped "<name> (archived …)" variant
  const folder = inArchive.find((c) => c.name === safe) || inArchive.find((c) => c.name.startsWith(`${safe} (archived `));
  if (!folder) return null;

  const move = (body: object) =>
    fetch(`${GRAPH}/drives/${root.driveId}/items/${folder.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  // restore the clean name; if that conflicts at root, keep its current name
  let res = await move({ parentReference: { id: root.itemId }, name: safe });
  if (res.status === 409) res = await move({ parentReference: { id: root.itemId } });
  if (!res.ok) throw new Error(`Graph un-archive move failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as DriveChild).webUrl;
}
