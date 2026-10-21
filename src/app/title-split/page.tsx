import Link from "next/link";
import { listProperties } from "@/lib/db";
import { TitleSplitBoard, type TitleSplitRow } from "@/components/TitleSplitBoard";

export const dynamic = "force-dynamic";

// Title Split pipeline — opportunities created from the Unbroken Freehold
// Finder. Same property records as the main pipeline (so DCAS / MAC / IPAD,
// documents and reports all still work), filtered to pipeline = "title-split".
export default async function TitleSplitPage() {
  const properties = await listProperties();
  const rows: TitleSplitRow[] = properties
    .filter((p) => p.pipeline === "title-split" && p.titleSplit)
    .map((p) => ({
      id: p.id,
      name: p.name,
      town: p.town,
      stage: p.titleSplit!.stage,
      stageUpdatedAt: p.titleSplit!.stageUpdatedAt ?? p.updatedAt ?? null,
      letterSentAt: p.titleSplit!.letterSentAt ?? null,
      addressCount: p.titleSplit!.addressCount,
      leaseCount: p.titleSplit!.leaseCount,
      ownerType: p.titleSplit!.ownerType,
      ownerTypeInferred: p.titleSplit!.ownerTypeInferred,
      companyName: p.titleSplit!.companyName ?? null,
      companyNumber: p.titleSplit!.companyNumber ?? null,
      companyAddress: p.titleSplit!.companyAddress ?? null,
      confidence: p.titleSplit!.confidence,
      inspireId: p.titleSplit!.inspireId,
    }))
    .sort((a, b) => (b.stageUpdatedAt ?? "").localeCompare(a.stageUpdatedAt ?? ""));

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-serif text-xs uppercase tracking-[0.3em] text-bronze-dark">Title Split Pipeline</p>
          <h1 className="mt-1 font-serif text-3xl text-ink sm:text-[34px]">Unbroken Freeholds</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            Whole buildings on one freehold title, bought to split into individual leasehold units. Each one comes from the
            <span className="font-medium text-ink"> freehold finder</span>; move it through the stages as the approach progresses.
          </p>
        </div>
        <Link href="/freeholds" className="btn-bronze self-start">Find more on the map</Link>
      </section>
      <TitleSplitBoard rows={rows} />
    </div>
  );
}
