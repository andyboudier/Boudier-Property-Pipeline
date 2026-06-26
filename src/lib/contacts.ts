import type { Contact } from "./types";

// Starter categories — users can also type their own on a contact.
export const DEFAULT_CATEGORIES = [
  "Architect",
  "Estate Agent",
  "Commercial Agent",
  "Accountant",
  "Solicitor",
  "Planning Consultant",
  "Surveyor",
  "Structural Engineer",
  "Contractor / Builder",
  "Lender / Broker",
  "Investor",
  "Coach",
  "Other",
];

// All categories in play = defaults + any custom ones already on contacts.
export function allCategories(contacts: Contact[]): string[] {
  const set = new Set(DEFAULT_CATEGORIES);
  for (const c of contacts) if (c.category?.trim()) set.add(c.category.trim());
  return [...set];
}

// Free-text search across the useful fields.
export function matchesQuery(c: Contact, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [c.name, c.company, c.jobTitle, c.category, c.email, c.phone, c.mobile, c.website, c.address, c.notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}
