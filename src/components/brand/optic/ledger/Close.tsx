/** Station 07, the close: the eight lines reconverge on the one amber action
 *  (the landing controller aims them at the button and draws them in). */
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { LEDGER_T } from "../copy/path";
import { SPECTRUM } from "../spectrum";
import Arrow from "../Arrow";

export default async function Close() {
  const t = await getT(LEDGER_T);
  return (
    <section className="ob-close" id="ob-close" aria-labelledby="ob-close-h">
      <svg className="ob-conv-lines" id="ob-conv" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        {SPECTRUM.map((h, k) => (
          <line key={h} x1={k < 4 ? -80 : 1680} y1={[40, 250, 470, 760, 60, 290, 520, 800][k]} x2="800" y2="450" style={{ stroke: h }} />
        ))}
      </svg>
      <div className="ob-close-inner">
        <p className="ob-kicker">
          <span>{t("closeNo")}</span> {t("closeKicker")}
        </p>
        <h2 id="ob-close-h" className="ob-h-close">
          {t("close1")}
          <br />
          <em>{t("close2")}</em>
        </h2>
        <p className="ob-lead">{t("closeLead")}</p>
        <div className="ob-actions-close">
          <Link className="ob-btn ob-btn-amber ob-btn-xl ob-point" href="/app" data-ob-point>
            {t("startFree")} <Arrow />
          </Link>
          <Link className="ob-btn ob-btn-ghost ob-btn-lg" href="/dashboard">
            {t("seeLive")}
          </Link>
        </div>
      </div>
    </section>
  );
}
