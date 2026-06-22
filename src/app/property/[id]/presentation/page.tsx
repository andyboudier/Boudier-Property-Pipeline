/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Playfair_Display, Montserrat } from "next/font/google";
import { getProperty } from "@/lib/db";
import { computeIpad } from "@/lib/ipadCalc";
import { computeInvestor, defaultInvestorTerms } from "@/lib/investorCalc";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { gbp, num, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

const display = Playfair_Display({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--pres-serif", display: "swap" });
const body = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--pres-sans", display: "swap" });

// Brand (from boudierproperty.co.uk)
const GOLD = "#C9944C";
const GOLD_DK = "#A9772F";
const INK = "#1B2430";
const PAPER = "#F6F5F0";
const CREAM = "#F5E8D4";
const MUTED = "#6B7280";
const LINE = "#E4E0D8";
const LOGO = "/boudier-logo.png"; // green-badge — for light backgrounds
const LOGO_LIGHT = "/boudier-logo-transparent.png"; // transparent — for the dark cover

const serif = { fontFamily: "var(--pres-serif)" };

export default async function PresentationPage({ params }: { params: { id: string } }) {
  const p = await getProperty(params.id);
  if (!p) notFound();

  const ipadOut = p.ipad?.inputs.units.length ? computeIpad(p.ipad.inputs) : null;
  const terms = p.investor ?? defaultInvestorTerms();
  const inv = computeInvestor(terms, ipadOut?.netProfit ?? 0);
  const printedOn = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  const returnLines = [
    terms.interestRatePct ? `${pct(terms.interestRatePct)} p.a. fixed interest` : null,
    terms.profitSharePct ? `${pct(terms.profitSharePct)} of net profit` : null,
    terms.targetRoiPct ? `${pct(terms.targetRoiPct)} target ROI over term` : null,
  ].filter(Boolean) as string[];

  const highlights = (terms.highlights || "").split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <div className={`${display.variable} ${body.variable}`} style={{ fontFamily: "var(--pres-sans)", color: INK }}>
      {/* Screen-only toolbar */}
      <div className="no-print mb-5 flex items-center justify-between">
        <Link href={`/property/${p.id}/investor`} className="text-sm text-ink-muted hover:text-bronze-dark">← Investor terms</Link>
        <ExportPdfButton />
      </div>

      <article className="presentation mx-auto max-w-[820px]">
        {/* ── COVER ── */}
        <section className="pres-page" style={{ background: INK, color: "#fff" }}>
          <div style={{ padding: "40px 44px", display: "flex", flexDirection: "column", minHeight: "1000px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <img src={LOGO_LIGHT} alt="Boudier Property" style={{ height: 60, objectFit: "contain" }} />
              <span style={{ fontSize: 11, letterSpacing: "0.28em", textTransform: "uppercase", color: GOLD }}>Investment Opportunity</span>
            </div>

            <div style={{ marginTop: 40, borderRadius: 10, overflow: "hidden", background: GOLD_DK, height: 360 }}>
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", ...serif, fontSize: 22 }}>
                  Boudier Property
                </div>
              )}
            </div>

            <div style={{ marginTop: 36 }}>
              <div style={{ color: GOLD, fontSize: 12, letterSpacing: "0.22em", textTransform: "uppercase" }}>{p.town} · {p.lpa}</div>
              <h1 style={{ ...serif, fontSize: 46, lineHeight: 1.05, margin: "10px 0 0", fontWeight: 700 }}>{p.name}</h1>
              <p style={{ marginTop: 12, maxWidth: 560, color: "rgba(255,255,255,0.78)", fontSize: 14 }}>{p.currentUse}</p>
            </div>

            <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, borderTop: `1px solid rgba(255,255,255,0.15)`, paddingTop: 20 }}>
              <CoverStat label="Investment sought" value={terms.investmentSought ? gbp(terms.investmentSought) : "—"} />
              <CoverStat label="Target return" value={inv.totalReturn ? `${pct(inv.roiPct)} ROI` : returnLines[0] ?? "—"} />
              <CoverStat label="Term" value={terms.termMonths ? `${terms.termMonths} months` : "—"} />
            </div>
            <div style={{ marginTop: 18, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Prepared {printedOn} · Strictly private &amp; confidential</div>
          </div>
        </section>

        {/* ── THE OPPORTUNITY ── */}
        <section className="pres-page print-break" style={{ background: PAPER, padding: "40px 44px" }}>
          <Kicker>The opportunity</Kicker>
          <h2 style={{ ...serif, fontSize: 28, margin: "6px 0 0" }}>{p.name}</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 22 }}>
            <Tile label="Guide price" value={gbp(p.guidePrice)} />
            <Tile label="Size" value={p.sizeSqFt != null ? `${num(p.sizeSqFt)} ft²` : "—"} />
            <Tile label="GDV" value={ipadOut ? gbp(ipadOut.gdv) : "—"} />
            <Tile label="Net profit" value={ipadOut ? gbp(ipadOut.netProfit) : "—"} accent />
          </div>

          {highlights.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <Kicker>Why this deal</Kicker>
              <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {highlights.map((h, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, fontSize: 14 }}>
                    <span style={{ color: GOLD, fontWeight: 700 }}>—</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Money breakdown */}
          {ipadOut && (
            <div style={{ marginTop: 30 }}>
              <Kicker>The numbers</Kicker>
              <BreakdownChart gdv={ipadOut.gdv} cost={ipadOut.totalCostOfDevelopment} profit={ipadOut.netProfit} />
            </div>
          )}
        </section>

        {/* ── INVESTOR RETURN ── */}
        <section className="pres-page print-break" style={{ background: "#fff", padding: "40px 44px" }}>
          <Kicker>Investor return</Kicker>
          <h2 style={{ ...serif, fontSize: 26, margin: "6px 0 0" }}>What you put in, what you get back</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 22 }}>
            <Tile label="Investment" value={terms.investmentSought ? gbp(terms.investmentSought) : "—"} />
            <Tile label="Investor profit" value={gbp(inv.totalReturn)} accent />
            <Tile label="Capital returned" value={gbp(inv.endValue)} />
            <Tile label="Annualised" value={inv.annualisedPct ? pct(inv.annualisedPct) : "—"} />
          </div>

          {terms.investmentSought ? (
            <div style={{ marginTop: 26 }}>
              <GrowthChart principal={inv.principal} totalReturn={inv.totalReturn} endValue={inv.endValue} />
            </div>
          ) : (
            <p style={{ marginTop: 16, color: MUTED, fontSize: 13 }}>Set the investment terms to populate the return projection.</p>
          )}

          {returnLines.length > 0 && (
            <p style={{ marginTop: 18, fontSize: 13, color: MUTED }}>
              Return structure: {returnLines.join("  ·  ")}
              {terms.security ? `  ·  Security: ${terms.security}` : ""}
            </p>
          )}

          {/* Timeline */}
          <div style={{ marginTop: 30 }}>
            <Kicker>Project timeline</Kicker>
            <TimelineChart months={terms.termMonths || p.ipad?.inputs.refTimescaleMonths || 18} />
          </div>
        </section>

        {/* ── PLANNING + CONTACT ── */}
        <section className="pres-page print-break" style={{ background: PAPER, padding: "40px 44px" }}>
          <Kicker>Planning &amp; site</Kicker>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 28px", marginTop: 14 }}>
            <Brief term="Current use / class" desc={p.currentUse} />
            <Brief term="Heritage / designation" desc={p.heritage} />
            <Brief term="Planning route" desc={p.fullPlanningRoute || p.pdRoute} />
            <Brief term="Likely outcome" desc={p.likelyOutcome} />
          </div>

          <div style={{ marginTop: 34, background: CREAM, borderRadius: 10, padding: "22px 24px" }}>
            <Kicker>Get involved</Kicker>
            <div style={{ ...serif, fontSize: 20, marginTop: 6 }}>{terms.contactName || "Boudier Property"}</div>
            <div style={{ fontSize: 14, color: INK, marginTop: 4 }}>
              {[terms.contactEmail, terms.contactPhone].filter(Boolean).join("  ·  ") || "boudierproperty.co.uk"}
            </div>
            {terms.minInvestment ? (
              <div style={{ marginTop: 8, fontSize: 13, color: MUTED }}>Minimum investment {gbp(terms.minInvestment)}</div>
            ) : null}
          </div>

          <p style={{ marginTop: 26, fontSize: 10, color: MUTED, lineHeight: 1.5 }}>
            This document is a high-level summary prepared for discussion with prospective investors. It is not financial advice
            or an offer of securities. Figures are projections based on current assumptions and may change. Capital is at risk.
          </p>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
            <img src={LOGO} alt="Boudier Property" style={{ height: 30, objectFit: "contain", borderRadius: 6 }} />
            <span style={{ fontSize: 10, color: MUTED }}>Intelligent Development, Lasting Value</span>
          </div>
        </section>
      </article>

      <style>{`
        .presentation { color: ${INK}; }
        .pres-page { border-radius: 12px; overflow: hidden; margin-bottom: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        @media print {
          @page { size: A4; margin: 0; }
          body { background: #fff !important; }
          .presentation { max-width: none !important; }
          .pres-page { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; min-height: 100vh; }
          .print-break { break-before: page; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
}

// ── presentation building blocks ─────────────────────────────────────────────
function Kicker({ children }: { children: React.ReactNode }) {
  return <div style={{ color: GOLD_DK, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}>{children}</div>;
}
function CoverStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>{label}</div>
      <div style={{ ...serif, fontSize: 22, marginTop: 4 }}>{value}</div>
    </div>
  );
}
function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: accent ? GOLD : "#fff", color: accent ? "#fff" : INK, border: `1px solid ${accent ? GOLD : LINE}`, borderRadius: 10, padding: "14px 14px" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: accent ? "rgba(255,255,255,0.8)" : MUTED }}>{label}</div>
      <div style={{ ...serif, fontSize: 21, marginTop: 6 }}>{value}</div>
    </div>
  );
}
function Brief({ term, desc }: { term: string; desc: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: GOLD_DK, fontWeight: 600 }}>{term}</div>
      <div style={{ fontSize: 13.5, color: INK, marginTop: 4, lineHeight: 1.5 }}>{desc || "—"}</div>
    </div>
  );
}

function GrowthChart({ principal, totalReturn, endValue }: { principal: number; totalReturn: number; endValue: number }) {
  const W = 700;
  const total = endValue || 1;
  const pW = (principal / total) * W;
  const rW = (totalReturn / total) * W;
  return (
    <svg viewBox={`0 0 ${W} 96`} width="100%" role="img" aria-label="Investment growth">
      <rect x={0} y={20} width={pW} height={34} fill={INK} />
      <rect x={pW} y={20} width={rW} height={34} fill={GOLD} />
      <text x={4} y={14} fontSize={11} fill={MUTED}>Your capital {gbp(principal)}</text>
      <text x={Math.min(pW + 4, W - 160)} y={14} fontSize={11} fill={GOLD_DK}>Profit {gbp(totalReturn)}</text>
      <text x={W} y={80} fontSize={15} fontWeight={700} fill={INK} textAnchor="end">{gbp(endValue)} returned</text>
    </svg>
  );
}

function BreakdownChart({ gdv, cost, profit }: { gdv: number; cost: number; profit: number }) {
  const items = [
    { label: "GDV", val: gdv, color: INK },
    { label: "Total cost", val: cost, color: GOLD_DK },
    { label: "Net profit", val: Math.max(profit, 0), color: GOLD },
  ];
  const max = Math.max(gdv, cost, 1);
  const W = 700, H = 170, base = 130, barW = 120, gap = (W - barW * 3) / 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Money breakdown">
      {items.map((it, i) => {
        const h = (it.val / max) * 96;
        const x = gap + i * (barW + gap);
        return (
          <g key={it.label}>
            <rect x={x} y={base - h} width={barW} height={h} fill={it.color} rx={3} />
            <text x={x + barW / 2} y={base - h - 8} fontSize={13} fontWeight={700} fill={INK} textAnchor="middle">{gbp(it.val)}</text>
            <text x={x + barW / 2} y={base + 18} fontSize={12} fill={MUTED} textAnchor="middle">{it.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function TimelineChart({ months }: { months: number }) {
  const phases = [
    { name: "Acquisition & design", frac: 0.18, color: INK },
    { name: "Construction", frac: 0.6, color: GOLD_DK },
    { name: "Marketing & sale", frac: 0.22, color: GOLD },
  ];
  const W = 700, H = 92, track = 30;
  let x = 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Project timeline">
      {phases.map((ph) => {
        const w = ph.frac * W;
        const seg = (
          <g key={ph.name}>
            <rect x={x} y={26} width={w - 3} height={track} fill={ph.color} rx={4} />
            <text x={x + 2} y={20} fontSize={11} fill={INK}>{ph.name}</text>
            <text x={x + 2} y={76} fontSize={11} fill={MUTED}>{Math.round(ph.frac * months)} mo</text>
          </g>
        );
        x += w;
        return seg;
      })}
      <text x={W} y={76} fontSize={12} fontWeight={700} fill={INK} textAnchor="end">{months} months to exit</text>
    </svg>
  );
}
