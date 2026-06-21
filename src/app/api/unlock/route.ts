import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GATE_COOKIE, gateCode, gateToken } from "@/lib/gate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const code = gateCode();
  if (!code) return NextResponse.json({ ok: true });

  const { pin } = await req.json().catch(() => ({ pin: "" }));
  if ((pin ?? "").toString().trim() !== code) return NextResponse.json({ ok: false });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(GATE_COOKIE, await gateToken(code), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
