import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// One-time: add East Sussex coverage. Hove/Brighton is a separate Rightmove
// region from East Sussex county, so we add both. CRON_SECRET-gated; dedupes by
// URL; safe to remove after running.
const WATCHES: { label: string; url: string }[] = [
  { label: "Rightmove — East Sussex", url: "https://www.rightmove.co.uk/commercial-property-for-sale/East-Sussex.html" },
  { label: "Rightmove — Brighton & Hove", url: "https://www.rightmove.co.uk/commercial-property-for-sale/Hove.html" },
  { label: "Zoopla — East Sussex", url: "https://www.zoopla.co.uk/for-sale/commercial/east-sussex/" },
];

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { listWatch, addWatch } = await import("@/lib/db");
  const have = new Set((await listWatch()).map((w) => w.url));
  const added: string[] = [];
  const skipped: string[] = [];
  for (const w of WATCHES) {
    if (have.has(w.url)) {
      skipped.push(w.label);
      continue;
    }
    await addWatch({ label: w.label, url: w.url, createdAt: new Date().toISOString() });
    added.push(w.label);
  }
  return NextResponse.json({ ok: true, added, skipped });
}
