import Link from "next/link";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/db";
import { emptyMac } from "@/lib/macCalc";
import { MacWorkbench } from "@/components/MacWorkbench";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // AI research agent (auto-fill) needs headroom

export default async function MacPage({ params }: { params: { id: string } }) {
  const p = await getProperty(params.id);
  if (!p) notFound();

  const mac = p.mac ?? {
    ...emptyMac(p.name, `Market area comparison for ${p.town}`),
    segments: emptyMac().segments.map((s) => ({ ...s, searchArea: p.town })),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/property/${p.id}`} className="text-xs text-ink-muted hover:text-bronze-dark">
          ← {p.name}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">2</span>
          <div>
            <h1 className="font-serif text-2xl text-ink">MAC — Market Area Comparison</h1>
            <p className="text-sm text-ink-muted">
              Capture comparable listings per bed-type segment. £/m², days on market and sales ratio compute automatically.
            </p>
          </div>
        </div>
      </div>

      <MacWorkbench propertyId={p.id} initial={mac} />
    </div>
  );
}
