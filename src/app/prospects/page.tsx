import Link from "next/link";
import { listLeads, listWatch } from "@/lib/db";
import { ProspectsBoard } from "@/components/ProspectsBoard";

export const dynamic = "force-dynamic";

export default async function ProspectsPage() {
  const [leads, watch] = await Promise.all([listLeads(), listWatch()]);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-ink-muted hover:text-bronze-dark">← Pipeline</Link>
        <h1 className="mt-2 font-serif text-2xl text-ink">Prospects</h1>
        <p className="text-sm text-ink-muted">
          Pre-pipeline. Paste a listing URL and AI reads the page into a prospect; review it, then promote to the pipeline.
        </p>
      </div>
      <ProspectsBoard initialLeads={leads} initialWatch={watch} />
    </div>
  );
}
