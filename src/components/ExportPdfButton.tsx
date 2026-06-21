"use client";

export function ExportPdfButton() {
  return (
    <button onClick={() => window.print()} className="btn-bronze">
      Export PDF
    </button>
  );
}
