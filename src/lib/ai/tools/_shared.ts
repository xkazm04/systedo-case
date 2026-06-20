/** Shared helpers for the AI tool modules (ads / brief / analysis / campaign-eval).
 *  Pure string/list utilities for cleaning, clamping and slugifying model output —
 *  no provider access, no schema knowledge. */

export const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export const cleanList = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

export const clamp = (s: string, n: number): string =>
  s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";

/** Bound a long source text before it goes into a prompt: keep the lead and the
 *  closing — both carry the most signal for retelling/repurposing — and elide the
 *  middle, so a long article can't blow up the prompt or token cost. No-op when the
 *  text is already within `max`. */
export const digest = (s: string, max = 6000): string => {
  const t = s.trim();
  if (t.length <= max) return t;
  const marker = "\n\n[…]\n\n";
  const keep = max - marker.length;
  const head = Math.floor(keep * 0.7);
  const tail = keep - head;
  return `${t.slice(0, head).trimEnd()}${marker}${t.slice(t.length - tail).trimStart()}`;
};

/** Like cleanList, but also clamps each item to a max character length so the
 *  server never emits over-limit ad copy that Google Ads / Sklik would reject. */
export const cleanClampedList = (v: unknown, maxCount: number, maxLen: number): string[] =>
  cleanList(v, maxCount).map((s) => clamp(s, maxLen));

/** Collect char-limit violations for a list of strings (used for self-repair). */
export const lenViolations = (label: string, items: string[], max: number): string[] =>
  items
    .map((s, i) => (s.length > max ? `${label} #${i + 1} má ${s.length} znaků (limit ${max}).` : null))
    .filter((v): v is string => v !== null);

export const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Diacritics -> ASCII for slugs, keyed by numeric code point. An explicit map is
// dependency-free and predictable (no String.normalize or locale assumptions).
export const DIACRITICS: Record<number, string> = {
  0x00e1: "a", 0x00e0: "a", 0x00e2: "a", 0x00e4: "a", 0x010d: "c", 0x0107: "c",
  0x00e7: "c", 0x010f: "d", 0x00e9: "e", 0x011b: "e", 0x00e8: "e", 0x00ea: "e",
  0x00eb: "e", 0x00ed: "i", 0x00ef: "i", 0x00ee: "i", 0x013a: "l", 0x013e: "l",
  0x0142: "l", 0x0148: "n", 0x00f1: "n", 0x00f3: "o", 0x00f4: "o", 0x00f6: "o",
  0x00f8: "o", 0x0159: "r", 0x0155: "r", 0x0161: "s", 0x015b: "s", 0x0165: "t",
  0x00fa: "u", 0x016f: "u", 0x00fc: "u", 0x00fb: "u", 0x00fd: "y", 0x00ff: "y",
  0x017e: "z", 0x017a: "z", 0x017c: "z",
};

export const slugify = (s: string): string =>
  Array.from(s.toLowerCase())
    .map((ch) => DIACRITICS[ch.codePointAt(0) ?? 0] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
