export const gbp = (n: number | null | undefined, dp = 0) =>
  n == null || isNaN(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: dp }).format(n);

export const num = (n: number | null | undefined, dp = 0) =>
  n == null || isNaN(n) ? "—" : new Intl.NumberFormat("en-GB", { maximumFractionDigits: dp }).format(n);

export const pct = (n: number | null | undefined, dp = 1) =>
  n == null || isNaN(n) ? "—" : `${(n * 100).toFixed(dp)}%`;

/**
 * A stored fraction (0.005) as the percentage NUMBER to show or edit (0.5),
 * rounded to 2 decimal places. Returns a number, so whole values stay clean:
 * 0.1 -> 10, not "10.00". One definition, because these had drifted to 0, 1,
 * 2 and 3 decimal places across the IPAD views.
 */
export const pctNum = (fraction: number | null | undefined) =>
  fraction == null || isNaN(fraction) ? 0 : +(fraction * 100).toFixed(2);

export const sqftToSqmDisplay = (sqft: number | null | undefined) =>
  sqft == null ? "—" : `${num(sqft * 0.092903)} m²`;
