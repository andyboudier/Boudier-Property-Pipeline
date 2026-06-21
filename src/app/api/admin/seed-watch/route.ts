import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// One-time seed of the auto-monitor watchlist with leading commercial agents
// across Berkshire, Hampshire, Wiltshire, Surrey and Oxfordshire. Secured by
// CRON_SECRET; safe to remove after running (it dedupes by URL).
const AGENTS: { label: string; url: string }[] = [
  { label: "Hicks Baker (Berkshire)", url: "https://www.hicksbaker.co.uk/properties-search/" },
  { label: "Haslams (Reading, Berkshire)", url: "https://haslams.co.uk/find-a-property/" },
  { label: "Vail Williams (Thames Valley/Surrey/Hants)", url: "https://www.vailwilliams.com/properties/" },
  { label: "Curchod & Co (Surrey/Hampshire)", url: "https://www.curchodandco.com/properties/" },
  { label: "Owen Isherwood (Surrey/Hampshire)", url: "https://www.owenisherwood.com/properties" },
  { label: "Woolley & Wallis (Wiltshire/Hampshire)", url: "https://www.w-w.co.uk/property-search/?departmnt=commercial&buy_rent=Buy&commercial_for_sale_to_rent=for_sale" },
  { label: "Myddelton & Major (Wiltshire/Hampshire)", url: "https://myddeltonmajor.co.uk/commercial/" },
  { label: "Carter Jonas (Oxfordshire + national)", url: "https://www.carterjonas.co.uk/commercial-properties" },
  { label: "Fields Commercial (Oxfordshire/M40)", url: "https://www.fieldscommercial.com/s/for-sale" },
  { label: "White Commercial (Banbury, Oxfordshire)", url: "https://www.whitecommercial.co.uk/property-search/results/created-by/548" },
];

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { listWatch, addWatch } = await import("@/lib/db");
  const existing = new Set((await listWatch()).map((w) => w.url));
  const added: string[] = [];
  const skipped: string[] = [];
  for (const a of AGENTS) {
    if (existing.has(a.url)) {
      skipped.push(a.label);
      continue;
    }
    await addWatch({ label: a.label, url: a.url, createdAt: new Date().toISOString() });
    added.push(a.label);
  }
  return NextResponse.json({ ok: true, added, skipped });
}
