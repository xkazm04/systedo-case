/** Station 02, Triage: the prism splits the account into campaign lines,
 *  sorted by what needs you first (stylised bands, labelled Sample). */
import { getT } from "@/lib/i18n/server";
import { BENCH_T } from "../copy/bench";
import StationShell, { vars } from "./StationShell";
import { SIX } from "../spectrum";

/** where each of the six fan lines lands, top to bottom */
const FAN_Y = [332, 399, 463, 525, 589, 656] as const;

const BANDS = [
  ["band1", "fixNow", 3.32],
  ["band2", "fixNow", 3.99],
  ["band3", "review", 4.63],
  ["band4", "review", 5.25],
  ["band5", "fine", 5.89],
  ["band6", "fine", 6.56],
] as const;

export default async function StationTriage() {
  const t = await getT(BENCH_T);
  const art = (
    <>
      <use href="#ob-i-rail" />
      <rect className="ob-a-bg" x="-1800" y="438" width="2268" height="44" fill="url(#ob-beamGlow)" />
      <line className="ob-a-bm" x1="-1800" y1="460" x2="468" y2="460" />
      <use href="#ob-i-carrier" x="620" />
      <use href="#ob-i-prism" />
      <path className="ob-a-bh" d="M468 460L792 494" />
      <path className="ob-a-bm ob-a-bm-dim" d="M468 460L792 494" />
      <circle cx="792" cy="494" r="46" fill="url(#ob-bloom)" />
      <g>
        {FAN_Y.map((y, k) => (
          <g key={y} className="ob-fl" style={vars({ "--k": k, transformOrigin: "792px 494px", stroke: SIX[k], fill: SIX[k] })}>
            <line className="ob-a-rh" x1="792" y1="494" x2="1290" y2={y} />
            <line className="ob-a-rc" x1="792" y1="494" x2="1290" y2={y} />
            <circle cx="1290" cy={y} r="3.5" stroke="none" />
          </g>
        ))}
      </g>
    </>
  );
  const labs = (
    <>
      <span className="ob-lab ob-deco" style={vars({ "--x": 6.4, "--y": 6.45 })}>
        {t("labPrism")}
      </span>
      <p className="ob-bands-h" style={vars({ "--x": 11.9, "--y": 2.35 })}>
        <b className="ob-tag">{t("sample")}</b> {t("bandsH")}
      </p>
      <ol className="ob-bands">
        {BANDS.map(([name, verdict, y], k) => (
          <li key={name} style={vars({ "--x": 13.05, "--y": y, "--h": SIX[k] })}>
            <b>{k + 1}</b> {t(name)}
            <small>{t(verdict)}</small>
          </li>
        ))}
      </ol>
    </>
  );
  return (
    <StationShell
      i={1}
      plateNo={t("st1No")}
      plate={t("st1Plate")}
      verb={t("st1Verb")}
      crop={[360, 170, 1000, 640]}
      art={art}
      labs={labs}
      cap={<p className="ob-lead">{t("st1Lead")}</p>}
      capW={3.1}
      capY={5.55}
      open={t("open")}
      zoom="39% 50%"
    />
  );
}
