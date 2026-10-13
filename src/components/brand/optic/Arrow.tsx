/** The engraved arrow glyph from the landing's shared defs. `dir` turns it to
 *  point left (back) or down (scroll on). Decorative: the label carries meaning. */
export default function Arrow({ dir }: { dir?: "l" | "d" }) {
  const cls = dir === "l" ? "ob-arr ob-arr-l" : dir === "d" ? "ob-arr ob-arr-d" : "ob-arr";
  return (
    <svg className={cls} aria-hidden="true" focusable="false">
      <use href="#ob-ico-arrow" />
    </svg>
  );
}
