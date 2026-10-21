// List orderings for the freehold map, shared by the API route and the client.
export const FREEHOLD_SORTS = {
  confidence: "Confidence",
  addresses: "Most addresses",
  "epc-worst": "Worst EPC first",
  "sale-recent": "Most recently sold",
  "sale-price": "Highest last sale",
} as const;
export type FreeholdSort = keyof typeof FREEHOLD_SORTS;
