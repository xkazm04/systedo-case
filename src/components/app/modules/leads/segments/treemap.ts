/** A squarified treemap layout — ~70 lines of pure arithmetic instead of a charting
 *  dependency. Bruls/Huizing/van Wijk: lay items out row by row along the shorter
 *  side of the remaining rectangle, extending a row only while doing so improves
 *  its worst aspect ratio. Squareness matters because a tile's AREA is the number
 *  being read, and a 1:20 sliver reads as a line, not as an area.
 *
 *  Pure and framework-free (no React, no DOM, no clock), so the layout is unit
 *  tested rather than eyeballed in a browser. Output rectangles are in the caller's
 *  own units and always sit inside `0..width × 0..height`. */

export interface TreemapItem {
  key: string;
  /** the magnitude the AREA encodes; ≤ 0 is dropped (a zero-area tile is a lie) */
  value: number;
}

export interface TreemapRect {
  key: string;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Layout `items` into `width × height`, biggest first. Items with a non-finite or
 *  non-positive value are dropped. An empty (or all-zero) input yields `[]`. */
export function squarify(
  items: readonly TreemapItem[],
  width: number,
  height: number
): TreemapRect[] {
  const clean = items
    .filter((i) => Number.isFinite(i.value) && i.value > 0)
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  if (clean.length === 0 || width <= 0 || height <= 0) return [];

  const total = clean.reduce((s, i) => s + i.value, 0);
  // Work in AREA units from the start: one scale factor, applied once.
  const scale = (width * height) / total;
  const out: TreemapRect[] = [];

  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let row: TreemapItem[] = [];
  let rowArea = 0;
  let i = 0;

  while (i < clean.length) {
    const item = clean[i]!;
    const area = item.value * scale;
    const side = Math.min(w, h);
    const next = worst(rowArea + area, [...row.map((r) => r.value * scale), area], side);
    const current = row.length === 0 ? Infinity : worst(rowArea, row.map((r) => r.value * scale), side);

    if (row.length === 0 || next <= current) {
      row.push(item);
      rowArea += area;
      i += 1;
      continue;
    }
    // The row got worse — freeze it and carve the remaining rectangle.
    const placed = place(row, rowArea, x, y, w, h, scale);
    out.push(...placed.rects);
    ({ x, y, w, h } = placed.rest);
    row = [];
    rowArea = 0;
  }

  if (row.length > 0) {
    out.push(...place(row, rowArea, x, y, w, h, scale).rects);
  }
  return out;
}

/** The worst (largest) aspect ratio in a row of the given total area laid along
 *  `side`. Infinity for a degenerate row, so it always loses the comparison. */
function worst(rowArea: number, areas: readonly number[], side: number): number {
  if (rowArea <= 0 || side <= 0) return Infinity;
  const thickness = rowArea / side;
  let max = 0;
  for (const a of areas) {
    const len = a / thickness;
    const ratio = Math.max(len / thickness, thickness / len);
    if (ratio > max) max = ratio;
  }
  return max;
}

/** Lay one frozen row along the shorter side and return the rectangle left over. */
function place(
  row: readonly TreemapItem[],
  rowArea: number,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number
): { rects: TreemapRect[]; rest: { x: number; y: number; w: number; h: number } } {
  const vertical = w >= h; // a column of tiles down the left edge
  const side = vertical ? h : w;
  const thickness = Math.min(vertical ? w : h, rowArea / side);
  const rects: TreemapRect[] = [];
  let offset = 0;

  row.forEach((item, idx) => {
    const area = item.value * scale;
    // The last tile takes the remainder, so rounding can never leave a seam.
    const len = idx === row.length - 1 ? side - offset : area / thickness;
    rects.push(
      vertical
        ? { key: item.key, value: item.value, x, y: y + offset, w: thickness, h: len }
        : { key: item.key, value: item.value, x: x + offset, y, w: len, h: thickness }
    );
    offset += len;
  });

  return {
    rects,
    rest: vertical
      ? { x: x + thickness, y, w: Math.max(0, w - thickness), h }
      : { x, y: y + thickness, w, h: Math.max(0, h - thickness) },
  };
}
