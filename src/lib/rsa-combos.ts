/** Deterministic combination sampler for the RSA ad preview.
 *
 *  Google serves a responsive search ad as rotating combinations of the
 *  uploaded assets, but the preview used to hard-slice the first 3 headlines +
 *  first 2 descriptions — one fixed view of the hundreds of combinations the
 *  user actually bought. This sampler rotates a stride window over the
 *  non-blank assets: combination i starts each list at offset i (wrapping), so
 *  clicking through shows how short and long headlines compose, with 1-based
 *  asset numbers to tie the view back to the numbered rows below the preview.
 *
 *  Pure and index-driven (no randomness — the preview renders inside React,
 *  where render-time entropy is a compiler-lint error and would repaint a
 *  different ad every render anyway). Any integer index is safe: it wraps
 *  modulo the combination count, so stale state after a re-generation still
 *  lands on a valid combination. */

export interface RsaCombo {
  /** normalized combination index (0-based, wrapped into range) */
  index: number;
  /** how many distinct rotations the current assets offer */
  count: number;
  headlines: string[];
  /** 1-based positions of the shown headlines within the non-blank list */
  headlineNumbers: number[];
  descriptions: string[];
  /** 1-based positions of the shown descriptions within the non-blank list */
  descriptionNumbers: number[];
}

/** How many assets one combination shows, per Google's serving shape. */
export const RSA_COMBO_HEADLINES = 3;
export const RSA_COMBO_DESCRIPTIONS = 2;

function pick(
  values: readonly string[],
  take: number,
  start: number
): { texts: string[]; numbers: number[] } {
  if (values.length === 0) return { texts: [], numbers: [] };
  const n = Math.min(take, values.length);
  const texts: string[] = [];
  const numbers: number[] = [];
  for (let j = 0; j < n; j++) {
    const at = (start + j) % values.length;
    texts.push(values[at]);
    numbers.push(at + 1);
  }
  return { texts, numbers };
}

/** Combination `index` over the non-blank assets. Index 0 is the first
 *  headlines/descriptions — exactly the view the preview always showed — so
 *  adding rotation changes nothing until the user asks for the next one. */
export function sampleRsaCombo(
  headlines: readonly string[],
  descriptions: readonly string[],
  index: number
): RsaCombo {
  const hs = headlines.map((h) => h.trim()).filter(Boolean);
  const ds = descriptions.map((d) => d.trim()).filter(Boolean);
  // One rotation step advances both lists; distinct views cycle at the longer
  // list's length (shorter lists wrap along), never fewer than one.
  const count = Math.max(hs.length, ds.length, 1);
  const i = ((index % count) + count) % count;
  const h = pick(hs, RSA_COMBO_HEADLINES, hs.length > 0 ? i % hs.length : 0);
  const d = pick(ds, RSA_COMBO_DESCRIPTIONS, ds.length > 0 ? i % ds.length : 0);
  return {
    index: i,
    count,
    headlines: h.texts,
    headlineNumbers: h.numbers,
    descriptions: d.texts,
    descriptionNumbers: d.numbers,
  };
}
