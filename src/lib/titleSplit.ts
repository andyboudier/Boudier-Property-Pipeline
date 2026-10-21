import type { TitleSplitStage } from "./types";

// Stage order, labels and colours for the Title Split pipeline. Shared by the
// board and the property page so they can't disagree.
export const TITLE_SPLIT_STAGES: { key: TitleSplitStage; label: string; color: string; hint: string }[] = [
  { key: "identified", label: "Identified", color: "#8A8A8A", hint: "On the list, nothing done yet" },
  { key: "researching", label: "Researching", color: "#4F6D7A", hint: "Confirming the owner — title register bought?" },
  { key: "letter-sent", label: "Letter sent", color: "#C2872B", hint: "Approach letter posted" },
  { key: "in-contact", label: "In contact", color: "#B08D57", hint: "Owner has replied" },
  { key: "negotiating", label: "Negotiating", color: "#8C6A3F", hint: "Terms under discussion" },
  { key: "under-offer", label: "Under offer", color: "#2E7D5B", hint: "Offer accepted, conveyancing" },
  { key: "acquired", label: "Acquired", color: "#1F3A5F", hint: "Freehold bought" },
  { key: "split", label: "Split", color: "#16202B", hint: "Title split complete, units for sale" },
  { key: "dead", label: "Dead", color: "#B23A48", hint: "Not proceeding" },
];

export const stageMeta = (s: TitleSplitStage) => TITLE_SPLIT_STAGES.find((x) => x.key === s) ?? TITLE_SPLIT_STAGES[0];

/** Stages that count as live work — everything but dead. */
export const LIVE_STAGES: TitleSplitStage[] = TITLE_SPLIT_STAGES.map((s) => s.key).filter((k) => k !== "dead");
