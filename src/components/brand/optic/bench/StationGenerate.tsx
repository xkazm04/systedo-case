/** Station 03, Generate: the lens focuses the lines into one finished thing,
 *  here a stylised ad with its live length gauges (30/30, 89/90). The final
 *  text is server-rendered; the bench camera re-types it when the station
 *  arrives (wide, motion allowed). */
import { getT } from "@/lib/i18n/server";
import { BENCH_T } from "../copy/bench";
import { SIX } from "../spectrum";
import StationShell, { vars } from "./StationShell";

/** each converging line: where it enters on the left, and where it crosses the lens */
const CONV = [
  [285, 364],
  [355, 402],
  [425, 441],
  [495, 479],
  [565, 518],
  [635, 557],
] as const;

export default async function StationGenerate() {
  const t = await getT(BENCH_T);
  const head = t("adHead");
  const desc = t("adDesc");
  const art = (
    <>
      <use href="#ob-i-rail" />
      <use href="#ob-i-carrier" x="560" />
      <g mask="url(#ob-mFadeL)">
        {CONV.map(([y0, y1], k) => (
          <g key={y0} className="ob-cl" style={vars({ "--k": k, transformOrigin: `0px ${y0}px`, stroke: SIX[k] })}>
            <path className="ob-a-rh" d={`M0 ${y0}L560 ${y1}L940 460`} />
            <path className="ob-a-rc" d={`M0 ${y0}L560 ${y1}L940 460`} />
          </g>
        ))}
      </g>
      <use href="#ob-i-lens" />
      <rect className="ob-a-bg" x="940" y="438" width="90" height="44" fill="url(#ob-beamGlow)" />
      <line className="ob-a-bm" x1="940" y1="460" x2="1030" y2="460" />
      <use href="#ob-i-focus" />
      <path className="ob-a-ln" d="M1030 244H1054M1030 244V268M1530 244H1506M1530 244V268M1030 690H1054M1030 690V666M1530 690H1506M1530 690V666" />
      <line className="ob-a-tk" x1="1022" y1="274" x2="1022" y2="662" strokeWidth="8" strokeDasharray="1 11" />
    </>
  );
  const labs = (
    <>
      <span className="ob-lab ob-deco" style={vars({ "--x": 5.72, "--y": 6.3 })}>
        {t("labLens")}
      </span>
      <span className="ob-lab ob-lab-c ob-deco" style={vars({ "--x": 9.4, "--y": 5.25 })}>
        {t("labFocus")}
      </span>
      <div className="ob-proof" style={vars({ "--x": 10.45, "--y": 2.65 })} data-ob-ad>
        <p className="ob-proof-h">
          <b className="ob-tag">{t("sample")}</b> {t("proofH")}
        </p>
        <p className="ob-ad-url">{t("adUrl")}</p>
        <p className="ob-ad-head" data-ob-type={head}>
          {head}
        </p>
        <p className="ob-gauge" role="img" aria-label={`${t("gaugeHead")}: ${head.length}/30`}>
          <span className="ob-g-bar" data-max="30" style={vars({ "--fill": Math.min(1, head.length / 30) })} />
          <span className="ob-g-num">{`${head.length}/30`}</span>
        </p>
        <p className="ob-ad-desc" data-ob-type={desc}>
          {desc}
        </p>
        <p className="ob-gauge" role="img" aria-label={`${t("gaugeDesc")}: ${desc.length}/90`}>
          <span className="ob-g-bar ob-g-bar-d" data-max="90" style={vars({ "--fill": Math.min(1, desc.length / 90) })} />
          <span className="ob-g-num">{`${desc.length}/90`}</span>
        </p>
        <ul className="ob-tags">
          <li>{t("tag1")}</li>
          <li>{t("tag2")}</li>
          <li>{t("tag3")}</li>
        </ul>
      </div>
    </>
  );
  const cap = (
    <>
      <p className="ob-lead">{t("st2Lead")}</p>
      <p className="ob-sub">{t("st2Sub")}</p>
    </>
  );
  return (
    <StationShell
      i={2}
      plateNo={t("st2No")}
      plate={t("st2Plate")}
      verb={t("st2Verb")}
      crop={[0, 190, 1000, 640]}
      art={art}
      labs={labs}
      cap={cap}
      capW={3.7}
      capY={5.35}
      open={t("open")}
      zoom="35% 50%"
    />
  );
}
