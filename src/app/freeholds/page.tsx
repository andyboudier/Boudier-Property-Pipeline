import Link from "next/link";
import { FreeholdMap } from "@/components/FreeholdMap";
import { isFreeholdsConfigured } from "@/lib/freeholds";

export const dynamic = "force-dynamic";

// Unbroken Freehold Finder (plan §6). Phase 2: filters, polygons, side card, export, Add to Pipeline.
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
          the lot. Filter, click a polygon for the owner and where to write, export for outreach, or add to the pipeline.
        </p>
      </div>

      <FreeholdMap apiKey={apiKey} configured={isFreeholdsConfigured()} />

    </div>
  );
}
