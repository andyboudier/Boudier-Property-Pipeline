import Link from "next/link";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-bronze/40 bg-ink text-bronze">
        {/* Minimal mark: a stylised pitched roof / "B" frame */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 11 12 4l8 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 10v9h12v-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.5 19v-4.2h3V19" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="leading-none">
        <span className="wordmark block font-serif text-[15px] font-medium text-ink">BOUDIER</span>
        {!compact && (
          <span className="wordmark-tight block text-[10px] font-semibold text-bronze-dark">PROPERTY</span>
        )}
      </span>
    </Link>
  );
}
