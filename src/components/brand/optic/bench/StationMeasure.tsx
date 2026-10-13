/** Station 01, Measure: slit, collimator and detector on the bench, with a
 *  sample readout (labelled Sample). Google Ads is the one live connector. */
import { getT } from "@/lib/i18n/server";
import { BENCH_T } from "../copy/bench";
import StationShell, { vars } from "./StationShell";

export default async function StationMeasure() {
  const t = await getT(BENCH_T);
  const art = (
    <>
      <use href="#ob-i-rail" />
      <rect className="ob-a-bg" x="-1800" y="438" width="5200" height="44" fill="url(#ob-beamGlow)" />
      <line className="ob-a-bm" x1="-1800" y1="460" x2="3400" y2="460" />
      <use href="#ob-i-carrier" x="521" />
      <use href="#ob-i-carrier" x="750" />
      <use href="#ob-i-carrier" x="1160" />
      <use href="#ob-i-slit" />
      <use href="#ob-i-coll" />
      <use href="#ob-i-det" />
      <g>
        <rect className="ob-a-l2" x="1000" y="112" width="460" height="160" />
        <path className="ob-a-l3" d="M1000 152H1460M1000 192H1460M1000 232H1460" />
        <path className="ob-a-ln" d="M994 106H1010M994 106V122M1466 106H1450M1466 106V122M994 278H1010M994 278V262M1466 278H1450M1466 278V262" />
        <polyline className="ob-a-t ob-a-t1" points="1016,246 1052,236 1088,242 1124,220 1160,228 1196,204 1232,212 1268,186 1304,196 1340,170 1376,178 1412,152 1444,140" />
        <polyline className="ob-a-t ob-a-t2" points="1016,256 1052,250 1088,246 1124,252 1160,234 1196,240 1232,220 1268,226 1304,208 1340,216 1376,196 1412,204 1444,190" />
        <polyline className="ob-a-t ob-a-t3" points="1016,266 1052,264 1088,260 1124,262 1160,256 1196,252 1232,258 1268,242 1304,246 1340,234 1376,238 1412,226 1444,230" />
        <line className="ob-a-scan" x1="1016" y1="118" x2="1016" y2="266" />
      </g>
      <circle className="ob-det-spot" cx="1110" cy="460" r="4.5" fill="#fff" />
    </>
  );
  const labs = (
    <>
      <span className="ob-lab ob-deco" style={vars({ "--x": 5.42, "--y": 6.2 })}>
        {t("labSlit")}
      </span>
      <span className="ob-lab ob-lab-c ob-deco" style={vars({ "--x": 7.5, "--y": 3.75 })}>
        {t("labColl")}
      </span>
      <span className="ob-lab ob-deco" style={vars({ "--x": 11.8, "--y": 6.4 })}>
        {t("labDet")}
        <small>{t("labDetSub")}</small>
      </span>
      <p className="ob-legend" style={vars({ "--x": 9.6, "--y": 0.62 })}>
        <b className="ob-tag">{t("sample")}</b>
        <i style={vars({ "--h": "var(--color-s-blue)" })}>{t("lgSpend")}</i>
        <i style={vars({ "--h": "var(--color-s-cyan)" })}>{t("lgClicks")}</i>
        <i style={vars({ "--h": "var(--color-s-green)" })}>{t("lgConv")}</i>
      </p>
    </>
  );
  return (
    <StationShell
      i={0}
      plateNo={t("st0No")}
      plate={t("st0Plate")}
      verb={t("st0Verb")}
      crop={[470, 90, 1000, 720]}
      art={art}
      labs={labs}
      cap={<p className="ob-lead">{t("st0Lead")}</p>}
      capW={3.8}
      capY={5.55}
      open={t("open")}
      zoom="72% 52%"
    />
  );
}
