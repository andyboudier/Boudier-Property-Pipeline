import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GATE_COOKIE, gateCode, gateToken } from "@/lib/gate";

export const dynamic = "force-dynamic";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: true,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

function safePath(p: unknown): string {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") ? p : "/";
}

export async function POST(req: NextRequest) {
  const code = gateCode();
  const ct = req.headers.get("content-type") || "";

  // Native form submit → set cookie on a redirect (most reliable across browsers).
  if (ct.includes("form")) {
    const form = await req.formData();
    const pin = (form.get("pin") ?? "").toString().trim();
    const from = safePath(form.get("from"));
    if (code && pin !== code) {
      return NextResponse.redirect(new URL(`/unlock?error=1&from=${encodeURIComponent(from)}`, req.nextUrl.origin), 303);
    }
    const res = NextResponse.redirect(new URL(from, req.nextUrl.origin), 303);
    if (code) res.cookies.set(GATE_COOKIE, await gateToken(code), COOKIE_OPTS);
    return res;
  }

  // JSON (programmatic / tests) → return { ok } with the cookie.
  const { pin } = await req.json().catch(() => ({ pin: "" }));
  if (!code) return NextResponse.json({ ok: true });
  if ((pin ?? "").toString().trim() !== code) return NextResponse.json({ ok: false });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GATE_COOKIE, await gateToken(code), COOKIE_OPTS);
  return res;
}
