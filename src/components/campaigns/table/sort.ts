"use client";

/** Sort model + localStorage persistence for CampaignTable, extracted so the
 *  render component stays focused on markup. Pure/logic only — no JSX. */

export type SortKey =
  | "severity"
  | "name"
  | "cost"
  | "conversions"
  | "conversionValue"
  | "cpa"
  | "roas"
  | "pno";
export type SortDir = "asc" | "desc";
export interface SortState {
  key: SortKey;
  dir: SortDir;
}

/** SortKey array used for validation when restoring sort from localStorage. */
export const SORT_KEYS: SortKey[] = [
  "severity",
  "name",
  "cost",
  "conversions",
  "conversionValue",
  "cpa",
  "roas",
  "pno",
];

const SORT_STORAGE_KEY = "campaigns.table.sort";
/** Persisted default: highest spend first — the lens a PPC manager reaches for. */
export const DEFAULT_SORT: SortState = { key: "cost", dir: "desc" };

export function loadSort(): SortState {
  if (typeof window === "undefined") return DEFAULT_SORT;
  try {
    const raw = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return DEFAULT_SORT;
    const p = JSON.parse(raw) as Partial<SortState>;
    if (p && SORT_KEYS.includes(p.key as SortKey) && (p.dir === "asc" || p.dir === "desc")) {
      return { key: p.key as SortKey, dir: p.dir };
    }
  } catch {
    /* corrupt or unavailable storage — fall back to the default */
  }
  return DEFAULT_SORT;
}

/** Persist the chosen sort so the table reopens the way the user left it.
 *  Storage may be unavailable (e.g. private mode) — non-fatal. */
export function saveSort(sort: SortState): void {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
  } catch {
    /* storage may be unavailable (e.g. private mode) — non-fatal */
  }
}
