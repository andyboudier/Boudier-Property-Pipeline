import type { RatingValue } from "./types";

// Mirrors the DCAS "Tables" sheet: 1 Critical … 5 Excellent, plus Unknown.
export const RATINGS: { value: RatingValue; label: string; short: string }[] = [
  { value: null, label: "Unknown", short: "—" },
  { value: 1, label: "Critical", short: "1" },
  { value: 2, label: "Concerning", short: "2" },
  { value: 3, label: "OK", short: "3" },
  { value: 4, label: "Good", short: "4" },
  { value: 5, label: "Excellent", short: "5" },
];

export function ratingLabel(v: RatingValue): string {
  return RATINGS.find((r) => r.value === v)?.label ?? "Unknown";
}

// Brand colour token per rating (used for chips/borders).
export function ratingColor(v: RatingValue): string {
  switch (v) {
    case 1:
      return "#B23A48"; // stop
    case 2:
      return "#C2872B"; // review
    case 3:
      return "#8A8F94"; // idle/neutral
    case 4:
      return "#3E8E6E";
    case 5:
      return "#2E7D5B"; // go
    default:
      return "#C9C6BF"; // unknown
  }
}
