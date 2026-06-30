import Link from "next/link";
import { getFirecrawlUsage, getTavilyUsage, getFirestoreCounts, scraperStatus } from "@/lib/usage";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const [fc, tv, counts] = await Promise.all([getFirecrawlUsage(), getTavilyUsage(), getFirestoreCounts()]);
  const scrapers = scraperStatus();
  const tvRemaining = tv.planLimit != null && tv.planUsage != null ? tv.planLimit - tv.planUsage : null;
  const tvPct = tv.planLimit ? Math.round(((tvRemaining ?? 0) / tv.planLimit) * 100) : null;
  const reset = fc.periodEnd ? new Date(fc.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
  const creditPct = fc.planCredits ? Math.round(((fc.remainingCredits ?? 0) / fc.planCredits) * 100) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-ink-muted hover:text-bronze-dark">← Pipeline</Link>
        <h1 className="mt-2 font-serif text-2xl text-ink">Usage & limits</h1>
        <p className="text-sm text-ink-muted">
          Live where each service exposes it; otherwise the plan limits with a link to the provider&apos;s own dashboard.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Firecrawl (live) ── */}
        <Card title="Firecrawl" sub="Web scraper (listings / portals)" href="https://www.firecrawl.dev/app" hrefLabel="Open dashboard">
          {fc.ok ? (
            <>
              <Meter
                label="Credits"
                remaining={fc.remainingCredits}
                plan={fc.planCredits}
                pct={creditPct}
              />
              {fc.planTokens != null && (
                <Meter label="Tokens" remaining={fc.remainingTokens} plan={fc.planTokens} pct={fc.planTokens ? Math.round(((fc.remainingTokens ?? 0) / fc.planTokens) * 100) : null} />
              )}
              {reset && <p className="mt-2 text-xs text-ink-muted">Resets {reset}</p>}
              {creditPct != null && creditPct <= 20 && (
                <p className="mt-1 text-xs font-medium text-status-stop">Running low — Tavily fallback {scrapers.tavily ? "is configured" : "not yet configured"}.</p>
              )}
            </>
          ) : (
            <Muted>No Firecrawl key configured, or usage unavailable.</Muted>
          )}
          <p className="mt-3 text-xs text-ink-muted">
            Portals use Firecrawl first; other sites prefer Tavily to save credits.
          </p>
        </Card>

        {/* ── Tavily (live) ── */}
        <Card title="Tavily" sub="Web scraper (agent sites) — primary for non-portals" href="https://app.tavily.com/" hrefLabel="Open dashboard">
          {!scrapers.tavily ? (
            <Muted>Not configured. Add <code className="text-ink">TAVILY_API_KEY</code> in Vercel to enable the fallback.</Muted>
          ) : tv.ok ? (
            <>
              <Meter label={`Plan credits${tv.plan ? ` (${tv.plan})` : ""}`} remaining={tvRemaining ?? undefined} plan={tv.planLimit ?? undefined} pct={tvPct} />
              <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-ink-muted">
                {tv.extractUsage != null && <span>Extract used: <strong className="text-ink-soft">{tv.extractUsage.toLocaleString()}</strong></span>}
                {tv.searchUsage != null && <span>Search used: <strong className="text-ink-soft">{tv.searchUsage.toLocaleString()}</strong></span>}
              </div>
            </>
          ) : (
            <Muted>Tavily key configured, but usage couldn&apos;t be read right now.</Muted>
          )}
          <p className="mt-3 text-xs text-ink-muted">Used first for non-portal sites; Firecrawl handles Rightmove/Zoopla.</p>
        </Card>

        {/* ── Anthropic (link) ── */}
        <Card title="Claude (Anthropic)" sub="AI extraction & research" href="https://platform.claude.com/cost" hrefLabel="Open cost dashboard">
          <Muted>
            Live cost & token usage are in the Anthropic console (admin-only API, so shown there rather than embedded here). It&apos;s prepaid credit — check the balance and set a spend limit under Settings → Limits.
          </Muted>
          <ul className="mt-2 space-y-1 text-xs text-ink-soft">
            <li>• <Link href="https://platform.claude.com/cost" className="text-bronze-dark hover:underline" target="_blank">Cost</Link> — total spend by model / date</li>
            <li>• <Link href="https://platform.claude.com/usage" className="text-bronze-dark hover:underline" target="_blank">Usage</Link> — token counts</li>
            <li>• Models in use: Haiku 4.5 (extraction), Sonnet 4.6 (research)</li>
          </ul>
        </Card>

        {/* ── Firebase (counts + limits) ── */}
        <Card title="Firebase (Firestore)" sub="Database — Spark (free) plan" href="https://console.firebase.google.com/" hrefLabel="Open Firebase console">
          {counts.ok ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Pipeline sites" value={counts.properties} />
              <Stat label="Prospects" value={counts.prospects} />
              <Stat label="Contacts" value={counts.contacts} />
              <Stat label="Monitored sources" value={counts.watches} />
            </div>
          ) : (
            <Muted>Couldn&apos;t read Firestore counts.</Muted>
          )}
          <div className="mt-3 text-xs text-ink-muted">
            Free-tier daily limits: <strong>50k</strong> reads · <strong>20k</strong> writes · <strong>20k</strong> deletes · <strong>1&nbsp;GiB</strong> stored. Live read/write counts are in the Firebase console → Usage.
          </div>
        </Card>

        {/* ── Vercel (limits) ── */}
        <Card title="Vercel" sub="Hosting & cron — Hobby (free) plan" href="https://vercel.com/dashboard/usage" hrefLabel="Open Vercel usage">
          <Muted>Hosting, the daily scan cron, and serverless functions run here.</Muted>
          <ul className="mt-2 space-y-1 text-xs text-ink-soft">
            <li>• Function timeout: <strong>60s</strong> (why the scan rotates portals)</li>
            <li>• <strong>100&nbsp;GB</strong> bandwidth / month</li>
            <li>• <strong>1</strong> cron job (the 7am scan)</li>
            <li>• Live bandwidth & invocations: Vercel → your project → Usage</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, sub, href, hrefLabel, children }: { title: string; sub: string; href: string; hrefLabel: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-ink">{title}</h2>
          <p className="text-xs text-ink-muted">{sub}</p>
        </div>
        <a href={href} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-bronze-dark hover:underline">{hrefLabel} ↗</a>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Meter({ label, remaining, plan, pct }: { label: string; remaining?: number; plan?: number; pct: number | null }) {
  const color = pct == null ? "#8A8F94" : pct > 40 ? "#2E7D5B" : pct > 20 ? "#C2872B" : "#B23A48";
  return (
    <div className="mt-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-muted">{label}</span>
        <span className="tabular-nums text-ink">
          <strong>{remaining?.toLocaleString() ?? "—"}</strong>
          {plan != null && <span className="text-ink-muted"> / {plan.toLocaleString()} left</span>}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-paper-line">
        <div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: color }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-paper-warm/60 px-3 py-2">
      <div className="text-lg font-semibold tabular-nums text-ink">{value.toLocaleString()}</div>
      <div className="text-[11px] text-ink-muted">{label}</div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-muted">{children}</p>;
}
