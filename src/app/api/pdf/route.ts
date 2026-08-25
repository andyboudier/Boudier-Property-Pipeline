import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Server-side PDF generation: renders one of the app's own report routes in
// headless Chromium (print media) and returns a real PDF file — no browser
// print dialog, no site chrome, no user-agent headers/footers.
//
// Only same-origin report paths are allowed (never arbitrary URLs).
const ALLOWED_PATH = /^\/property\/[a-z0-9-]+\/(report|presentation|ipad\/table|(dcas|mac|ipad)\/print)$/;

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") || "";
  if (!ALLOWED_PATH.test(path)) {
    return NextResponse.json({ ok: false, error: "invalid path" }, { status: 400 });
  }

  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");

  // On Vercel (linux) the bundled binary is used; locally fall back to an
  // installed Chrome so the route is testable in dev.
  const executablePath =
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : await chromium.executablePath();

  const browser = await puppeteer.launch({
    args: [...chromium.args, "--font-render-hinting=none"],
    executablePath,
    headless: true,
    defaultViewport: { width: 794, height: 1123 }, // A4 @ 96dpi
  });

  try {
    const page = await browser.newPage();
    // Bypass the SSO gate for these internal, same-origin render requests.
    if (process.env.CRON_SECRET) {
      await page.setExtraHTTPHeaders({ "x-internal-auth": process.env.CRON_SECRET });
    }
    await page.emulateMediaType("print"); // apply the pages' @media print rules
    const target = new URL(path, req.nextUrl.origin).toString();
    await page.goto(target, { waitUntil: "networkidle0", timeout: 45_000 });
    // Give web fonts/images a beat to settle.
    await page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? null);

    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      preferCSSPageSize: true, // honour the app's @page size + margins
    });

    // e.g. /property/express-house…/report → express-house…-report.pdf
    const name = path.split("/").filter(Boolean).slice(1).join("-").replace(/[^a-z0-9-]/gi, "-") || "report";
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${name}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("PDF generation failed:", e);
    return NextResponse.json({ ok: false, error: "PDF generation failed" }, { status: 500 });
  } finally {
    await browser.close();
  }
}
