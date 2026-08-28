import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import path from "path";
import { getProperty } from "@/lib/db";
import { computeIpad, ipadInputsForProperty } from "@/lib/ipadCalc";
import type { IpadInputs } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ──────────────────────────────────────────────────────────────────────────
// Export the IPAD into the "IPAD Foundation" Excel template.
//
// Only the template's INPUT cells are written — every formula, fill, font,
// merge and column width is left exactly as the template has it, so the
// workbook still recalculates itself in Excel.
//
// Where a percentage fee has been overridden with a fixed £ amount in the app,
// we back-solve the percentage that makes the template's own formula produce
// that £ figure. That keeps the formulas intact and the numbers matching.
// ──────────────────────────────────────────────────────────────────────────

const TEMPLATE = path.join(process.cwd(), "src", "templates", "IPAD.xltx");
const SHEET = "IPAD Foundation";
const FIRST_UNIT_ROW = 84; // rows 84–101 hold the unit lines
const LAST_UNIT_ROW = 101;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }
  const property = await getProperty(id);
  if (!property) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const inp: IpadInputs = ipadInputsForProperty(property);
  const out = computeIpad(inp);
  const ov = inp.overrides ?? {};

  // The £ amount the app actually used for a fee, expressed as the percentage
  // the template needs so its formula reproduces that amount.
  const pctFor = (key: keyof IpadInputs & string, base: number): number => {
    const stored = (inp[key] as number) || 0;
    const override = ov[key];
    if (typeof override !== "number") return stored;
    return base > 0 ? override / base : stored;
  };

  const area = inp.areaM2 || 0;
  const commercial = area * inp.commercialRatePerM2;
  const industrial = area * inp.industrialRatePerM2;
  const newBuild = area * inp.newBuildRatePerM2;
  const contingencyBase = commercial + industrial + newBuild + inp.landscaping + inp.otherCosts; // G37:G41
  const constructionBase = out.constructionBase; // G35:G43
  const commercialFinance = Math.max(out.totalPurchaseCosts - inp.privateFinance, 0); // G53
  const devLoan = out.totalConstruction; // G64

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) return NextResponse.json({ ok: false, error: "template sheet missing" }, { status: 500 });

  const put = (ref: string, value: string | number | Date | null) => {
    if (value === null || value === "") return; // leave the template's blank
    ws.getCell(ref).value = value;
  };

  // ── Header block ──
  put("E4", property.name);
  put("E5", inp.description);
  if (inp.appraisalDate) {
    // Build the date in UTC — a local-time Date shifts the serial by the
    // timezone offset and can land the export on the previous day.
    const [y, m, d] = inp.appraisalDate.split("-").map(Number);
    if (y && m && d) put("E6", new Date(Date.UTC(y, m - 1, d)));
  }
  put("E7", area);
  put("E8", inp.refTimescaleMonths);

  // ── Purchase costs & fees ──
  put("G14", inp.purchasePrice);
  put("G15", inp.solicitors);
  put("G16", inp.stampDuty);
  put("G17", inp.findersFee);
  put("G18", inp.managementFee);

  // ── Construction / refurbishment ──
  put("H22", pctFor("devMgmtPct", constructionBase));
  put("H23", pctFor("planningPct", constructionBase));
  put("H24", pctFor("architect1Pct", constructionBase));
  put("H25", pctFor("architect2Pct", constructionBase));
  put("H26", pctFor("structuralPct", constructionBase));
  put("G27", inp.partyWall);
  put("G28", inp.saps);
  put("H29", pctFor("contractAdminPct", constructionBase));
  put("G30", inp.emptyRates);
  put("G31", inp.buildingWarranty);
  put("H32", pctFor("cdmPct", constructionBase));
  put("G33", inp.cil106);
  put("G34", inp.buildingControl);
  put("G35", inp.demolition);
  put("G36", inp.asbestos);
  put("H37", inp.commercialRatePerM2);
  // The template ships without a cost formula in G37, unlike its siblings G38
  // and G39 (=SUM(E7*H38/39)). Left as-is the commercial construction cost came
  // out as £0 in Excel, which dragged the contingency and every %-of-
  // construction fee down with it — Express House read 62.4% profit on GDV
  // against the app's 25.4%. Write the formula the row should have had, with a
  // cached result so the figure is right even before Excel recalculates.
  ws.getCell("G37").value = { formula: "SUM(E7*H37)", result: commercial };
  put("H38", inp.industrialRatePerM2);
  put("H39", inp.newBuildRatePerM2);
  put("G40", inp.landscaping);
  put("G41", inp.otherCosts);
  put("H42", pctFor("contingencyPct", contingencyBase));
  put("G43", inp.utilities);
  put("G44", inp.accountancy);
  put("G45", inp.vatOnCosts);

  // ── Finance — purchase ──
  put("G49", inp.privateFinance);
  put("H50", inp.privateFinanceMonths);
  put("J50", pctFor("privateFinanceRatePerMonth", inp.privateFinance * inp.privateFinanceMonths));
  put("H54", inp.commBridgeMonths);
  put("J54", pctFor("commBridgeRatePerMonth", commercialFinance * inp.commBridgeMonths));
  put("H55", pctFor("commBrokerPct", commercialFinance));
  put("H56", pctFor("commAdminPct", commercialFinance));
  put("G57", inp.commValuation);
  put("H58", pctFor("commExitPct", commercialFinance));

  // ── Finance — development ──
  put("H65", inp.devBridgeMonths);
  put("J65", pctFor("devBridgeRatePerMonth", devLoan * inp.devBridgeMonths));
  put("H66", pctFor("devBrokerPct", devLoan));
  put("H67", pctFor("devAdminPct", devLoan));
  put("G68", inp.devValuation);
  put("H69", pctFor("devExitPct", devLoan));

  // ── Disposal ──
  put("H74", pctFor("agentSellingPct", out.gdv));

  // ── Sales projections (unit lines) ──
  const units = (inp.units ?? []).slice(0, LAST_UNIT_ROW - FIRST_UNIT_ROW + 1);
  units.forEach((u, i) => {
    const row = FIRST_UNIT_ROW + i;
    put(`A${row}`, u.units);
    put(`B${row}`, u.m2);
    put(`D${row}`, u.type);
    put(`G${row}`, u.totalGdv);
  });
  put("E103", inp.valuationReport);

  // The template ships with every formula's cached result at zero. Tell Excel
  // to recalculate the whole workbook on open, otherwise the totals would show
  // as £0 until the user forced a recalc.
  wb.calcProperties.fullCalcOnLoad = true;

  const buffer = await wb.xlsx.writeBuffer();
  const fileBuf = Buffer.from(buffer);
  const stem = (property.name || "IPAD").replace(/[^\w\s.-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "IPAD";

  // ?save=1 — keep the workbook in the site's OneDrive folder and hand back the
  // link so it can be opened in Excel from there (permanent, and re-exporting
  // replaces the same file rather than piling up copies).
  if (req.nextUrl.searchParams.get("save") === "1") {
    const { isOneDriveConfigured, uploadToSiteFolder } = await import("@/lib/onedrive");
    if (!isOneDriveConfigured()) {
      return NextResponse.json({ ok: false, error: "OneDrive is not configured — the file was downloaded instead." }, { status: 503 });
    }
    try {
      const saved = await uploadToSiteFolder(property.name, `${stem} - IPAD.xlsx`, fileBuf);
      if (!saved?.webUrl) throw new Error("no webUrl returned");
      // The workbook is now the master copy: lock the app's IPAD to read-only
      // until someone reverts it.
      const { updateProperty } = await import("@/lib/db");
      await updateProperty(id, { ipadExcelUrl: saved.webUrl, ipadExcelAt: new Date().toISOString() });
      return NextResponse.json({ ok: true, url: saved.webUrl, name: saved.name });
    } catch (e) {
      console.error("IPAD OneDrive save failed:", e);
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "Could not save to OneDrive" },
        { status: 502 },
      );
    }
  }
  // Header values must be ASCII, so send a plain filename plus an RFC 5987
  // UTF-8 variant for browsers that support it.
  const ascii = `${stem} - IPAD.xlsx`.replace(/[^\x20-\x7E]/g, "");
  return new NextResponse(fileBuf, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(`${stem} - IPAD.xlsx`)}`,
      "cache-control": "no-store",
    },
  });
}
