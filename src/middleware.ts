import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";
import { auth } from "@/auth";
import { isAuthConfigured, hasAccess } from "@/lib/authConfig";

// Gate the whole app behind Microsoft Entra SSO + access-group membership.
//
// - Until the Entra credentials are configured, everything passes (the app
//   keeps working before the Azure setup is done).
// - NextAuth's own routes, the sign-in page, and static assets are always open.
// - Vercel cron routes protect themselves with CRON_SECRET, so they bypass here
//   (cron requests carry no session). The PDF renderer fetches report pages
//   internally with an x-internal-auth header and bypasses too.
// - No session → redirect to /signin. Signed in but not in the group →
//   /signin?denied=1.

const PUBLIC_PREFIXES = ["/api/auth", "/api/cron", "/signin"];

function passWith(req: NextRequest) {
  const h = new Headers(req.headers);
  h.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: h } });
}

const gated = auth((req) => {
  const { pathname } = req.nextUrl;
  const pass = () => passWith(req);

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return pass();
  }
  // Internal render requests from /api/pdf (headless Chromium) — same-origin,
  // no user session, authorised by the shared secret.
  const internal = req.headers.get("x-internal-auth");
  if (internal && internal === process.env.CRON_SECRET) return pass();

  const session = req.auth;
  if (!session?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (!hasAccess((session as { groups?: string[] }).groups)) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.search = "?denied=1";
    return NextResponse.redirect(url);
  }
  return pass();
});

// When SSO isn't configured yet, bypass NextAuth entirely so the app stays open
// (and can't break on a missing secret) until the Entra env vars are set.
export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (!isAuthConfigured()) return passWith(req);
  return (gated as unknown as (r: NextRequest, e: NextFetchEvent) => ReturnType<typeof NextResponse.next>)(req, ev);
}

// Run on everything except Next internals and static files (logos, images).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$).*)"],
};
