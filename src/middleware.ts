import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GATE_COOKIE, gateCode, gateToken } from "@/lib/gate";

export async function middleware(req: NextRequest) {
  const code = gateCode();
  if (!code) return NextResponse.next(); // gate disabled when APP_ACCESS_CODE unset

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/unlock")) return NextResponse.next();

  const cookie = req.cookies.get(GATE_COOKIE)?.value;
  if (cookie && cookie === (await gateToken(code))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = pathname && pathname !== "/" ? `?from=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  // Gate everything except Next internals and static image assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|svg|ico|webp|gif)$).*)"],
};
