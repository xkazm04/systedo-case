/** Stylised samples drawn inside each lamp room (viewBox 0 0 400 240), one per
 *  module group. Illustrations, labelled Stylised on the page; no data. */
import type { ReactElement } from "react";
import type { SampleKind } from "./groups";

export type SampleWords = { spend: string; headline: string; lead: string; stock: string };

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

const DRAW: Record<SampleKind, (w: SampleWords) => ReactElement> = {
  analytics: (w) => (
    <>
      <path className="ob-s-l3" d="M20 70H380M20 120H380M20 170H380" />
      {[28, 44, 36, 62, 50, 78, 66, 92].map((h, i) => (
        <rect key={i} className="ob-s-f2" x={24 + i * 45} y={212 - h} width="28" height={h} />
      ))}
      <polyline className="ob-s-ln" points="30,190 82,164 128,174 176,126 222,138 270,96 318,106 372,56" />
      <circle className="ob-s-f" cx="372" cy="56" r="5" />
      <path className="ob-s-l2" d="M20 212H380" />
      <text x="20" y="34">{w.spend}</text>
    </>
  ),
  campaigns: () => (
    <>
      {[300, 252, 206, 160, 118, 76].map((wd, i) => (
        <g key={i}>
          <rect className="ob-s-fw" x="56" y={22 + i * 34} width="324" height="20" />
          <rect className="ob-s-f" x="56" y={22 + i * 34} width={wd} height="20" style={{ fillOpacity: 0.9 - i * 0.12 }} />
          <text x="22" y={39 + i * 34}>{i + 1}</text>
        </g>
      ))}
    </>
  ),
  content: (w) => (
    <>
      <text x="20" y="38">{w.headline}</text>
      <path className="ob-s-ln" d="M20 52H300" />
      {[360, 330, 360, 250].map((wd, i) => (
        <rect key={i} className="ob-s-fw" x="20" y={74 + i * 22} width={wd} height="10" />
      ))}
      <line className="ob-s-ln" x1="20" y1="190" x2="290" y2="190" strokeDasharray="7 4" style={{ strokeWidth: 10 }} />
      <text x="304" y="198">30/30</text>
    </>
  ),
  creative: () => (
    <>
      <rect className="ob-s-l2" x="20" y="20" width="170" height="170" />
      <circle className="ob-s-f" cx="105" cy="105" r="46" />
      <path className="ob-s-ln" d="M20 190L190 20" />
      <rect className="ob-s-l2" x="214" y="20" width="112" height="200" />
      <path className="ob-s-f2" d="M214 150L326 96V220H214Z" />
      <circle className="ob-s-f" cx="270" cy="68" r="22" />
      <rect className="ob-s-l2" x="346" y="20" width="40" height="86" />
      <path className="ob-s-ln" d="M346 106L386 20" />
      <text x="20" y="220">1:1</text>
    </>
  ),
  local: () => (
    <>
      <rect className="ob-s-l2" x="20" y="20" width="360" height="200" />
      <path className="ob-s-l3" d="M20 70H380M20 120H380M20 170H380M110 20V220M200 20V220M290 20V220" />
      <rect className="ob-s-fw" x="40" y="86" width="50" height="22" />
      <rect className="ob-s-fw" x="214" y="132" width="60" height="26" />
      <rect className="ob-s-fw" x="304" y="40" width="56" height="20" />
      <path className="ob-s-l2" d="M20 190L140 150L250 180L380 90" />
      {[[150, 110], [280, 92], [86, 168]].map(([x, y], i) => (
        <g key={i}>
          <circle className="ob-s-f" cx={x} cy={y} r="12" />
          <text x={x + 18} y={y + 7}>{i + 1}</text>
        </g>
      ))}
    </>
  ),
  social: () => (
    <>
      <text x="20" y="64">Meta</text>
      <text x="20" y="150">TikTok</text>
      <path className="ob-s-l3" d="M120 40V200M170 40V200M220 40V200M270 40V200M320 40V200M370 40V200" />
      <path className="ob-s-l2" d="M110 100H390M110 190H390" />
      {[[145, 70], [245, 54], [345, 82]].map(([x, y]) => (
        <rect key={x} className="ob-s-f" x={x - 14} y={y} width="28" height="28" />
      ))}
      {[[120, 160], [195, 140], [295, 160], [370, 146]].map(([x, y]) => (
        <g key={x}>
          <rect className="ob-s-f2" x={x - 14} y={y} width="28" height="28" />
          <rect className="ob-s-l2" x={x - 14} y={y} width="28" height="28" />
        </g>
      ))}
    </>
  ),
  leads: (w) => (
    <>
      {[340, 262, 176, 92].map((wd, i) => (
        <g key={i}>
          <rect className="ob-s-f2" x={200 - wd / 2} y={22 + i * 52} width={wd} height="40" style={{ fillOpacity: 0.14 + i * 0.1 }} />
          <rect className="ob-s-l2" x={200 - wd / 2} y={22 + i * 52} width={wd} height="40" />
        </g>
      ))}
      <circle className="ob-s-f" cx="200" cy="190" r="9" />
      <text x="226" y="198">{w.lead}</text>
    </>
  ),
  catalog: (w) => (
    <>
      {range(4).map((i) => {
        const x = 20 + i * 92;
        return (
          <g key={i}>
            <rect className="ob-s-l2" x={x} y="24" width="80" height="120" />
            {i === 0 && <circle className="ob-s-f" cx={x + 40} cy="84" r="26" />}
            {i === 1 && <rect className="ob-s-f" x={x + 16} y="60" width="48" height="48" />}
            {i === 2 && <path className="ob-s-f" d={`M${x + 40} 56L${x + 68} 108H${x + 12}Z`} />}
            {i === 3 && <path className="ob-s-f" d={`M${x + 40} 54L${x + 66} 84L${x + 40} 114L${x + 14} 84Z`} />}
            <line x1={x} y1="170" x2={x + 80} y2="170" style={{ strokeWidth: 8, stroke: "rgba(237,234,227,.14)" }} />
            <line className="ob-s-ln" x1={x} y1="170" x2={x + [66, 44, 72, 28][i]} y2="170" style={{ strokeWidth: 8 }} />
          </g>
        );
      })}
      <text x="20" y="214">{w.stock}</text>
    </>
  ),
};

export default function LampSample({ kind, words }: { kind: SampleKind; words: SampleWords }) {
  return (
    <svg viewBox="0 0 400 240" aria-hidden="true" focusable="false">
      {DRAW[kind](words)}
    </svg>
  );
}
