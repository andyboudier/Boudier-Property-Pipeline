import Link from "next/link";
import { FreeholdMap } from "@/components/FreeholdMap";
import { isFreeholdsConfigured } from "@/lib/freeholds";

export const dynamic = "force-dynamic";

// Unbroken Freehold Finder (plan §6). Phase 0: the map, behind existing auth.
export default function FreeholdsPage() {
  // Maps JS keys are necessarily visible to the browser — they are protected by
  // HTTP-referrer and API restrictions in Google Cloud, not by secrecy.
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  return (
    <div className="space-y-5">
      <div>
        <Link href="/" className="text-xs text-ink-muted hover:text-bronze-dark">← Home</Link>
        <h1 className="mt-2 font-serif text-2xl text-ink">Unbroken Freeholds</h1>
        <p className="text-sm text-ink-muted">
          Whole buildings held on a single freehold title with no flats sold off on long leases — owners who can sell
          the lot. Phase 0: map only; filters and polygons follow once the data pipeline runs.
        </p>
      </div>

      <FreeholdMap apiKey={apiKey} configured={isFreeholdsConfigured()} />

      <section className="card p-5">
        <h2 className="font-serif text-lg text-ink">What this will filter on</h2>
        <ul className="mt-2 space-y-1 text-sm text-ink-soft">
          <li>· Freehold title, 2–20 addresses on it, and no registered leases — the &ldquo;unbroken&rdquo; test</li>
          <li>· Owner is a private individual or a company (not a council, housing association or the Crown)</li>
          <li>· More than two EPC records on the title, as evidence it is genuinely multi-unit</li>
          <li>· Conservation areas, Article 4, listed buildings and flood zones shown as overlays</li>
        </ul>
        <p className="mt-3 text-xs text-ink-muted">
          Council and constraint data comes from planning.data.gov.uk under the Open Government Licence — the same
          source the GoPlanner appraisal app uses. Absence of a record is not proof a constraint does not exist:
          coverage varies by local authority.
        </p>
      </section>
    </div>
  );
}
