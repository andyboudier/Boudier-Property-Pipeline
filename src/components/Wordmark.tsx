import Link from "next/link";

/* eslint-disable @next/next/no-img-element */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center" aria-label="Boudier Property">
      <img
        src="/boudier-logo.png"
        alt="Boudier Property"
        className={`${compact ? "h-8" : "h-9"} w-auto rounded-md`}
      />
    </Link>
  );
}
