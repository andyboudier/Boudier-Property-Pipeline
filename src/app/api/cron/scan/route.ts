import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  const authed = req.headers.get("authorization") === `Bearer ${secret}` || req.headers.get("x-vercel-cron") != null;
  if (!authed) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { runScan } = await import("@/lib/scan");
  const summary = await runScan();
  return NextResponse.json(summary);
}
