import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// One-time fix: the Rightmove/Zoopla watches were search *landing* pages (no
// location) so returned no listings. Replace any portal watch with proper
// per-county results URLs. CRON_SECRET-gated; safe to remove after running.
const COUNTIES = ["Berkshire", "Hampshire", "Wiltshire", "Surrey", "Oxfordshire"];
const NEW_PORTALS: { label: string; url: string }[] = [
  ...COUNTIES.map((c) => ({ label: `Rightmove — ${c}`, url: `https://www.rightmove.co.uk/commercial-property-for-sale/${c}.html` })),
  ...COUNTIES.map((c) => ({ label: `Zoopla — ${c}`, url: `https://www.zoopla.co.uk/for-sale/commercial/${c.toLowerCase()}/` })),
];

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { listWatch, addWatch, deleteWatch } = await import("@/lib/db");
  const existing = await listWatch();

  // Remove every current portal watch (the broken landing pages + any dupes).
  const removed: string[] = [];
  for (const w of existing) {
    if (/(rightmove|zoopla|onthemarket)\./i.test(w.url)) {
      await deleteWatch(w.id);
      removed.push(`${w.label} — ${w.url}`);
    }
  }

  // Add the per-county results pages (skip if an identical URL somehow remains).
  const have = new Set((await listWatch()).map((w) => w.url));
  const added: string[] = [];
  for (const p of NEW_PORTALS) {
    if (have.has(p.url)) continue;
    await addWatch({ label: p.label, url: p.url, createdAt: new Date().toISOString() });
    added.push(p.label);
  }

  return NextResponse.json({ ok: true, removed, added });
}
