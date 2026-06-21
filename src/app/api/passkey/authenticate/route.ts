import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GATE_COOKIE, WA_CHALLENGE_COOKIE, gateCode, gateToken } from "@/lib/gate";

export const dynamic = "force-dynamic";

// GET → authentication options (+ store challenge)
export async function GET() {
  const { buildAuthOptions } = await import("@/lib/webauthn");
  const { options, hasCredentials } = await buildAuthOptions();
  const res = NextResponse.json({ options, hasCredentials });
  res.cookies.set(WA_CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 300,
  });
  return res;
}

// POST → verify assertion; on success set the gate cookie
export async function POST(req: NextRequest) {
  const expectedChallenge = req.cookies.get(WA_CHALLENGE_COOKIE)?.value;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Bad request" });

  const { verifyAuth } = await import("@/lib/webauthn");
  const result = await verifyAuth(body, expectedChallenge);

  const res = NextResponse.json(result);
  res.cookies.delete(WA_CHALLENGE_COOKIE);
  if (result.ok) {
    const code = gateCode();
    if (code) {
      res.cookies.set(GATE_COOKIE, await gateToken(code), {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
  }
  return res;
}
