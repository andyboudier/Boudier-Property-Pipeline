import Link from "next/link";
import { listSnapshots } from "@/lib/db";
import { RecoverList } from "@/components/RecoverList";

export const dynamic = "force-dynamic";

export default async function RecoverPage() {
  const snapshots = await listSnapshots();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/" className="text-xs text-ink-muted hover:text-bronze-dark">← Pipeline</Link>
        <h1 className="mt-2 font-serif text-2xl text-ink">Backups & recovery</h1>
        <p className="text-sm text-ink-muted">
          The last 100 snapshots are kept automatically: an auto backup is taken before changes land (at most every 30
          minutes per site), plus snapshots on delete, overwrite and restore. Restoring brings back the full site —
          DCAS / MAC / IPAD included — and the current state is snapshotted first, so restores are always reversible.
        </p>
      </div>
      <RecoverList snapshots={snapshots} />
    </div>
  );
}
