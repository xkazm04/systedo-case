/** Branding helpers — validate a hex accent and pick a readable text color to
 *  render on top of it (so the client-report preview stays legible on any
 *  accent). Pure & framework-free, tested. */

import { luminance as wcagLuminance, readableInkOn } from "@/lib/design-tokens-color";

export const ACCENT_PALETTE = [
  "#14b8b1", "#6366f1", "#fb7141", "#0e9c97", "#0891b2",
  "#e11d48", "#7c3aed", "#f59e0b", "#0ea5e9", "#16a34a",
];

export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

/** Relative luminance (0..1) of a #rrggbb color; 0 for anything malformed.
 *  Delegates to the shared, WCAG-correct gamma-corrected relative-luminance
 *  formula in design-tokens-color.ts. (This module previously carried its own
 *  divergent plain-weighted-average approximation that disagreed with the
 *  design-system helper on real accent colors — e.g. #f59e0b.) */
export function luminance(hex: string): number {
  return isHexColor(hex) ? wcagLuminance(hex) : 0;
}

/** Legible text color to place on top of an accent fill. Delegates the
 *  dark-vs-white DECISION to the shared `readableInkOn` (single source of truth
 *  for the luminance formula + threshold), then maps its dark sentinel
 *  (`var(--color-ink)`) to a concrete `#111111`: the client-report header
 *  preview renders on an arbitrary accent and must stay legible independent of
 *  the surrounding theme's `--color-ink`, so callers here need a fixed hex — not
 *  a CSS var. */
export function readableOn(hex: string): "#111111" | "#ffffff" {
  return readableInkOn(hex) === "#ffffff" ? "#ffffff" : "#111111";
}

/** Up to two uppercase initials from a project/brand name, for a logo fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
