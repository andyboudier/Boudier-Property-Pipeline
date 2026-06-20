import type { ProcedabilityResult } from "@/lib/types";
import { statusMeta } from "@/lib/procedability";

export function StatusBadge({
  status,
  size = "md",
}: {
  status: ProcedabilityResult["status"];
  size?: "sm" | "md";
}) {
  const m = statusMeta(status);
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${pad}`}
      style={{ background: `${m.color}14`, color: m.color, border: `1px solid ${m.color}33` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

const outcomeIcon: Record<string, { ch: string; color: string }> = {
  pass: { ch: "✓", color: "#2E7D5B" },
  warn: { ch: "!", color: "#C2872B" },
  fail: { ch: "✕", color: "#B23A48" },
  na: { ch: "·", color: "#8A8F94" },
};

export function ChecksPanel({ result }: { result: ProcedabilityResult }) {
  return (
    <ul className="divide-y divide-paper-line">
      {result.checks.map((c) => {
        const ic = outcomeIcon[c.outcome];
        return (
          <li key={c.key} className="flex items-start gap-3 py-2.5">
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ background: `${ic.color}1A`, color: ic.color }}
            >
              {ic.ch}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">{c.label}</div>
              <div className="text-[13px] leading-snug text-ink-muted">{c.detail}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
