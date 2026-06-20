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
        <h1 className="mt-2 font-serif text-2xl text-ink">Recently deleted</h1>
        <p className="text-sm text-ink-muted">
          Sites are snapshotted when deleted. Restore one to bring it back with its DCAS / MAC / IPAD data intact, or
          remove it permanently.
        </p>
      </div>
      <RecoverList snapshots={snapshots} />
    </div>
  );
}
