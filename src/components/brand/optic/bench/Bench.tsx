/** The bench: three stations along one beam. On a wide screen with motion
 *  allowed it pins under the site nav and the camera (fx/camera.ts) travels
 *  through the stations as the page scrolls; otherwise they stack. The rail
 *  buttons are wired by the landing controller (data-ob-go). */
import { getT } from "@/lib/i18n/server";
import { BENCH_T } from "../copy/bench";
import StationMeasure from "./StationMeasure";
import StationTriage from "./StationTriage";
import StationGenerate from "./StationGenerate";

export default async function Bench() {
  const t = await getT(BENCH_T);
  const rail = [t("st0Verb"), t("st1Verb"), t("st2Verb")];
  return (
    <section className="ob-bench" id="ob-bench" aria-labelledby="ob-bench-h">
      <h2 className="ob-sr" id="ob-bench-h">
        {t("benchH")}
      </h2>
      <div className="ob-bench-pin" id="ob-bench-pin">
        <div className="ob-bench-world" id="ob-world">
          <StationMeasure />
          <StationTriage />
          <StationGenerate />
        </div>
        <nav className="ob-bench-rail" aria-label={t("rail")}>
          {rail.map((label, i) => (
            <button key={label} type="button" data-ob-go={i}>
              <b>0{i + 1}</b>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <p className="ob-bench-hint" id="ob-bench-hint" aria-hidden="true">
          {t("hint")}
        </p>
      </div>
    </section>
  );
}
