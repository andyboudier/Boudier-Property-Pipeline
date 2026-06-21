import { UnlockForm } from "@/components/UnlockForm";

export const dynamic = "force-dynamic";

export default function UnlockPage({ searchParams }: { searchParams: { from?: string } }) {
  const from = typeof searchParams.from === "string" ? searchParams.from : "/";
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="card w-full max-w-xs p-6 text-center">
        <div className="wordmark font-serif text-base font-semibold text-ink">BOUDIER PROPERTY</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.25em] text-bronze-dark">Site Appraisal Pipeline</div>
        <h1 className="mt-5 font-serif text-lg text-ink">Enter access code</h1>
        <UnlockForm from={from} />
      </div>
    </div>
  );
}
