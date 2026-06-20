export const gbp = (n: number | null | undefined, dp = 0) =>
  n == null || isNaN(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: dp }).format(n);

export const num = (n: number | null | undefined, dp = 0) =>
  n == null || isNaN(n) ? "—" : new Intl.NumberFormat("en-GB", { maximumFractionDigits: dp }).format(n);

export const pct = (n: number | null | undefined, dp = 1) =>
  n == null || isNaN(n) ? "—" : `${(n * 100).toFixed(dp)}%`;

export const sqftToSqmDisplay = (sqft: number | null | undefined) =>
  sqft == null ? "—" : `${num(sqft * 0.092903)} m²`;
