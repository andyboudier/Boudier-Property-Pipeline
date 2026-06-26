import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { usingFirestore } from "@/lib/db";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-paper-line bg-paper-warm/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/" className="rounded-md px-3 py-1.5 text-ink-soft hover:bg-white hover:text-ink">
            Pipeline
          </Link>
          <Link href="/prospects" className="rounded-md px-3 py-1.5 text-ink-soft hover:bg-white hover:text-ink">
            Prospects
          </Link>
          <Link href="/contacts" className="rounded-md px-3 py-1.5 text-ink-soft hover:bg-white hover:text-ink">
            Contacts
          </Link>
          <Link href="/property/new" className="rounded-md px-3 py-1.5 text-ink-soft hover:bg-white hover:text-ink">
            Add site
          </Link>
          <Link href="/settings" className="rounded-md px-3 py-1.5 text-ink-soft hover:bg-white hover:text-ink">
            Criteria
          </Link>
          <span
            className="ml-2 hidden items-center gap-1.5 rounded-full border border-paper-line bg-white px-2.5 py-1 text-[11px] font-medium text-ink-muted sm:inline-flex"
            title={usingFirestore ? "Connected to Firestore" : "Demo store — connect Firestore to persist"}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: usingFirestore ? "#2E7D5B" : "#C2872B" }}
            />
            {usingFirestore ? "Firestore" : "Demo data"}
          </span>
        </nav>
      </div>
    </header>
  );
}
