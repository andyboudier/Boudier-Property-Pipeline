// EPC energy-efficiency bands, coloured as on the certificate itself. Shared by
// the freehold map (client) and anything server-side that labels a band.

export const EPC_BANDS = ["A", "B", "C", "D", "E", "F", "G"] as const;
export type Band = (typeof EPC_BANDS)[number];

export const EPC_COLOUR: Record<Band, string> = {
  A: "#008054",
  B: "#19b459",
  C: "#8dce46",
  D: "#ffd500",
  E: "#fcaa65",
  F: "#ef8023",
  G: "#e9153b",
};

/** Text that stays legible on the band's colour. */
export const EPC_TEXT: Record<Band, string> = {
  A: "#fff", B: "#fff", C: "#1a1a1a", D: "#1a1a1a", E: "#1a1a1a", F: "#fff", G: "#fff",
};

/** Below E: a domestic let needs works before it can be let again (MEES). */
export const isSubstandard = (b: Band | null | undefined) => b === "F" || b === "G";
