"use client";

/** Filter model + localStorage persistence for CampaignTable. Extracted so the
 *  render component stays focused on markup, and so CampaignsClient can import
 *  the same restore logic (the type filter is lifted there — the TypeBreakdown
 *  cards drive it too). Pure/logic only — no JSX. */
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  type CampaignStatus,
  type CampaignType,
} from "@/lib/campaigns/types";

const FILTERS_STORAGE_KEY = "campaigns.table.filters";

export interface StoredFilters {
  query: string;
  typeFilter: CampaignType | "all";
  statusFilter: CampaignStatus | "all";
  attentionOnly: boolean;
}

export const DEFAULT_FILTERS: StoredFilters = {
  query: "",
  typeFilter: "all",
  statusFilter: "all",
  attentionOnly: false,
};

/** Restore the table filters the same way sort is restored, so an agency reviewing
 *  the same segment daily doesn't re-apply them on every visit. Each field is
 *  validated against the known values before use. Exported because the type
 *  filter is lifted to CampaignsClient (the TypeBreakdown cards drive it too)
 *  and its initial value must come from the same stored record. */
export function loadFilters(): StoredFilters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const p = JSON.parse(raw) as Partial<StoredFilters>;
    return {
      query: typeof p.query === "string" ? p.query : "",
      typeFilter:
        p.typeFilter === "all" || (CAMPAIGN_TYPES as readonly string[]).includes(p.typeFilter as string)
          ? (p.typeFilter as CampaignType | "all")
          : "all",
      statusFilter:
        p.statusFilter === "all" ||
        (CAMPAIGN_STATUSES as readonly string[]).includes(p.statusFilter as string)
          ? (p.statusFilter as CampaignStatus | "all")
          : "all",
      attentionOnly: typeof p.attentionOnly === "boolean" ? p.attentionOnly : false,
    };
  } catch {
    /* corrupt or unavailable storage — fall back to the defaults */
  }
  return DEFAULT_FILTERS;
}

/** Persist the filters alongside sort, so a daily reviewer's segment survives a
 *  reload. Storage may be unavailable (e.g. private mode) — non-fatal. */
export function saveFilters(filters: StoredFilters): void {
  try {
    window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    /* storage may be unavailable (e.g. private mode) — non-fatal */
  }
}
