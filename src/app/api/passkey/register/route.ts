import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { WA_CHALLENGE_COOKIE } from "@/lib/gate";

export const dynamic = "force-dynamic";

// This route stays behind the gate (middleware), so registering a passkey
// requires being unlocked already — you can't add a device without the code.

// GET → registration options (+ store challenge)
export async function GET() {
  const { buildRegisterOptions } = await import("@/lib/webauthn");
  const options = await buildRegisterOptions();
  const res = NextResponse.json(options);
  res.cookies.set(WA_CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 300,
  });
  return res;
}

// POST → verify + store the credential
export async function POST(req: NextRequest) {
  const expectedChallenge = req.cookies.get(WA_CHALLENGE_COOKIE)?.value;
  const body = await req.json().catch(() => null);
  if (!body?.response) return NextResponse.json({ ok: false, error: "Bad request" });

  const { verifyRegister } = await import("@/lib/webauthn");
  const result = await verifyRegister(body.response, body.label ?? "This device", expectedChallenge);
  const res = NextResponse.json(result);
  res.cookies.delete(WA_CHALLENGE_COOKIE);
  return res;
}
