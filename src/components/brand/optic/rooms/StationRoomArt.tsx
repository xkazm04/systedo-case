/** The engraved anatomy drawings behind the three station rooms: each zooms
 *  into one instrument and numbers three callouts on it. Stylised. */
import { SIX } from "../spectrum";
import { vars } from "../bench/StationShell";

type Mark = readonly [x: number, y: number];

function Callouts({ leads, marks }: { leads: string; marks: readonly Mark[] }) {
  return (
    <>
      <g className="ob-leads">
        <path className="ob-a-ln" d={leads} />
      </g>
      <g className="ob-mk">
        {marks.map(([x, y]) => (
          <circle key={`c${x}`} cx={x} cy={y} r="22" />
        ))}
        {marks.map(([x, y], i) => (
          <text key={`t${x}`} x={x} y={y + 8} textAnchor="middle">
            {i + 1}
          </text>
        ))}
      </g>
    </>
  );
}

export function DetectorArt() {
  return (
    <>
      <g mask="url(#ob-mFadeR0)">
        <rect className="ob-a-bg" x="-400" y="448" width="2400" height="44" fill="url(#ob-beamGlow)" />
        <line className="ob-a-bm" x1="-400" y1="470" x2="2000" y2="470" />
      </g>
      <g transform="translate(1030 470) scale(1.9) translate(-1160 -460)">
        <use href="#ob-i-det" />
      </g>
      <Callouts leads="M938 470L800 330M1030 700L890 770M1310 330L1430 250" marks={[[800, 330], [890, 770], [1430, 250]]} />
    </>
  );
}

const PRISM_Y = [426.4, 454.3, 480.9, 507.1, 533.7, 561.6] as const;

export function PrismArt() {
  return (
    <>
      <g transform="translate(900 520) scale(1.75) translate(-620 -450)">
        <g mask="url(#ob-mFadeL)">
          <rect className="ob-a-bg" x="-1200" y="438" width="1668" height="44" fill="url(#ob-beamGlow)" />
          <line className="ob-a-bm" x1="-1200" y1="460" x2="468" y2="460" />
        </g>
        <use href="#ob-i-prism" />
        <path className="ob-a-bh" d="M468 460L792 494" />
        <path className="ob-a-bm ob-a-bm-dim" d="M468 460L792 494" />
        <circle cx="792" cy="494" r="46" fill="url(#ob-bloom)" />
        {PRISM_Y.map((y, k) => (
          <g key={y} style={vars({ stroke: SIX[k] })}>
            <line className="ob-a-rh" x1="792" y1="494" x2="1000" y2={y} />
            <line className="ob-a-rc" x1="792" y1="494" x2="1000" y2={y} />
          </g>
        ))}
      </g>
      <Callouts leads="M1390 585L1420 380M585 537L600 450M900 300L1000 150" marks={[[1420, 360], [600, 430], [1000, 130]]} />
    </>
  );
}

const LENS_IN = [
  [300, 364],
  [360, 402],
  [420, 441],
  [500, 479],
  [560, 518],
  [620, 557],
] as const;

export function LensArt() {
  return (
    <>
      <g transform="translate(700 470) scale(1.9) translate(-560 -460)">
        <g mask="url(#ob-mFadeR3)">
          {LENS_IN.map(([y0, y1], k) => (
            <g key={y0} style={vars({ stroke: SIX[k] })}>
              <path className="ob-a-rh" d={`M120 ${y0}L560 ${y1}L940 460`} />
              <path className="ob-a-rc" d={`M120 ${y0}L560 ${y1}L940 460`} />
            </g>
          ))}
        </g>
        <use href="#ob-i-lens" />
        <use href="#ob-i-focus" />
        <line className="ob-a-bh" x1="940" y1="460" x2="1240" y2="460" />
        <line className="ob-a-bm" x1="940" y1="460" x2="1240" y2="460" />
      </g>
      <Callouts leads="M700 250L560 150M1050 480L1180 640M1530 470L1500 300" marks={[[560, 150], [1180, 640], [1500, 280]]} />
    </>
  );
}
