/** Branding helpers — validate a hex accent and pick a readable text color to
 *  render on top of it (so the client-report preview stays legible on any
 *  accent). Pure & framework-free, tested. */

export const ACCENT_PALETTE = [
  "#14b8b1", "#6366f1", "#fb7141", "#0e9c97", "#0891b2",
  "#e11d48", "#7c3aed", "#f59e0b", "#0ea5e9", "#16a34a",
];

export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

/** Relative luminance (0..1) of a #rrggbb color; 0 for anything malformed. */
export function luminance(hex: string): number {
  if (!isHexColor(hex)) return 0;
  const h = hex.slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Legible text color to place on top of an accent fill. */
export function readableOn(hex: string): "#111111" | "#ffffff" {
  return luminance(hex) > 0.6 ? "#111111" : "#ffffff";
}

/** Up to two uppercase initials from a project/brand name, for a logo fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
