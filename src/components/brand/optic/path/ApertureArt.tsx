/** Engraved art for the five apertures: an iris that opens wider at each step
 *  (its blades turn as the step arrives) and a small glyph naming the step. */

/** the iris opening at each step */
const OPEN = [6, 10, 15, 21, 28] as const;

export function Iris({ i }: { i: number }) {
  return (
    <svg className="ob-ap-iris" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle className="ob-a-ln" cx="60" cy="60" r="54" />
      <circle className="ob-a-l2" cx="60" cy="60" r="46" />
      <path className="ob-a-l2 ob-iris-bl" d="M60 14L84 22M101 36L102 58M96 88L82 104M60 106L38 98M20 84L18 62M24 32L42 16" />
      <circle className="ob-a-ln ob-iris-op" cx="60" cy="60" r={OPEN[i]} />
    </svg>
  );
}

const GLYPHS = [
  <>
    <rect className="ob-a-ln" x="2" y="6" width="60" height="28" rx="14" />
    <path className="ob-a-l2" d="M16 20h26" />
    <circle className="ob-a-ln" cx="49" cy="20" r="3" />
    <path className="ob-a-ln" d="M12 14v12" />
  </>,
  <>
    <circle className="ob-a-ln" cx="26" cy="18" r="12" />
    <path className="ob-a-ln" d="M35 27L50 36" />
    <path className="ob-a-l2" d="M18 18H34M26 10V26" />
  </>,
  <>
    <path className="ob-a-ln" d="M6 34V24M18 34V16M30 34V8M42 34V20M54 34V28" />
    <path className="ob-a-l2" d="M2 36H62" />
  </>,
  <>
    <path className="ob-a-ln" d="M32 36C20 28 14 20 14 14A18 14 0 0 1 50 14C50 20 44 28 32 36Z" />
    <circle className="ob-a-ln" cx="32" cy="14" r="5" />
  </>,
  <>
    <path className="ob-a-ln" d="M12 4H44L52 12V36H12Z" />
    <path className="ob-a-l2" d="M44 4V12H52M20 18H44M20 24H44M20 30H36" />
  </>,
];

export function Glyph({ i }: { i: number }) {
  return (
    <svg className="ob-ap-glyph" viewBox="0 0 64 40" aria-hidden="true" focusable="false">
      {GLYPHS[i]}
    </svg>
  );
}

/** The beam that widens through the apertures (wide stage only). */
export function ApertureBeam() {
  return (
    <svg className="ob-ap-beam" viewBox="0 0 1600 200" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ob-apG" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff6e6" stopOpacity=".03" />
          <stop offset=".55" stopColor="#fff6e6" stopOpacity=".1" />
          <stop offset="1" stopColor="#ffe9c0" stopOpacity=".26" />
        </linearGradient>
        <linearGradient id="ob-apG2" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity=".08" />
          <stop offset=".6" stopColor="#fff" stopOpacity=".32" />
          <stop offset="1" stopColor="#fffaf0" stopOpacity=".95" />
        </linearGradient>
      </defs>
      <polygon className="ob-ap-bh" points="0,98.4 232,92 516,86 800,79 1084,70 1368,59 1600,48 1600,152 1368,141 1084,130 800,121 516,114 232,108 0,101.6" />
      <polygon className="ob-ap-bc" points="0,99.2 232,95 516,91.4 800,87 1084,81.5 1368,74.5 1600,66 1600,134 1368,125.5 1084,118.5 800,113 516,108.6 232,105 0,100.8" />
      <line className="ob-a-bm" x1="0" y1="100" x2="1600" y2="100" />
    </svg>
  );
}
