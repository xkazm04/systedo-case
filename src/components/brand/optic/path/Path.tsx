/** Station 05, the five apertures: the zero-budget path, from "what do I sell"
 *  to a channel plan with drafts. Each step lights as the beam reaches it (the
 *  landing controller toggles .is-on and --bp from scroll). */
import { Fragment } from "react";
import { getT } from "@/lib/i18n/server";
import { PATH_T } from "../copy/path";
import { vars } from "../bench/StationShell";
import { ApertureBeam, Glyph, Iris } from "./ApertureArt";

type K = keyof (typeof PATH_T)["en"];
const STEPS: { t: K; d: K; tag?: K }[] = [
  { t: "ap0T", d: "ap0D", tag: "ap0Tag" },
  { t: "ap1T", d: "ap1D" },
  { t: "ap2T", d: "ap2D", tag: "ap2Tag" },
  { t: "ap3T", d: "ap3D" },
  { t: "ap4T", d: "ap4D" },
];
const EXAMPLES = ["Google Business Profile", "Zboží.cz (Seznam)", "Heureka", "Firmy.cz (Seznam)"];

export default async function Path() {
  const t = await getT(PATH_T);
  return (
    <section className="ob-path" id="ob-path" aria-labelledby="ob-path-h">
      <div className="ob-path-stage">
        <header className="ob-path-head">
          <p className="ob-kicker">
            <span>{t("kickerNo")}</span> {t("kicker")}
          </p>
          <h2 id="ob-path-h" className="ob-h-sec">
            {t("h")}
          </h2>
          <p className="ob-lead">{t("lead")}</p>
        </header>
        <ol className="ob-aps">
          {STEPS.map((s, i) => (
            <li key={s.t} className="ob-ap" style={vars({ "--i": i })}>
              <Iris i={i} />
              <Glyph i={i} />
              <p className="ob-ap-n">
                0{i + 1}
                {s.tag ? <i>{t(s.tag)}</i> : null}
              </p>
              <h3 className="ob-ap-t">{t(s.t)}</h3>
              <p className="ob-ap-d">{t(s.d)}</p>
            </li>
          ))}
        </ol>
        <ApertureBeam />
        <p className="ob-path-eg">
          <span>{t("eg")}</span>
          {EXAMPLES.map((e, i) => (
            <Fragment key={e}>
              {i > 0 ? <b aria-hidden="true">·</b> : " "}
              {e}
            </Fragment>
          ))}
        </p>
        <p className="ob-path-focus">
          <i aria-hidden="true" /> {t("focus")}
        </p>
      </div>
    </section>
  );
}
