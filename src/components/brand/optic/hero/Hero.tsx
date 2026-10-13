/** 00 Source: the hero. The headline, the plain-language promise and both
 *  CTAs are server-rendered text, so they paint before any script; the beam
 *  and prism are a lazy canvas island (HeroOptics) layered behind them. */
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { HERO_T } from "../copy/hero";
import Arrow from "../Arrow";
import HeroOptics from "./HeroOptics";

export default async function Hero() {
  const t = await getT(HERO_T);
  return (
    <section className="ob-hero" id="ob-source" aria-labelledby="ob-hero-title">
      <HeroOptics>
        <div className="ob-hero-stage">
          <p className="ob-plate ob-hero-plate">
            <span>{t("plateNo")}</span> {t("plate")}
          </p>
          <h1 className="ob-hero-title" id="ob-hero-title">
            <span className="ob-t1">{t("title1")}</span>
            <span className="ob-t2">
              <em>{t("title2")}</em>
            </span>
          </h1>
          <p className="ob-plain">{t("plain")}</p>
          <div className="ob-actions">
            <Link className="ob-btn ob-btn-amber ob-btn-lg" href="/app">
              {t("startFree")} <Arrow />
            </Link>
            <Link className="ob-btn ob-btn-ghost ob-btn-lg" href="/dashboard">
              {t("seeLive")}
            </Link>
          </div>
          <p className="ob-honest">
            {t("honest1")} <b aria-hidden="true">·</b> {t("honest2")} <b aria-hidden="true">·</b> {t("honest3")}
          </p>
          <p className="ob-fig ob-hero-fig">
            <span>{t("figNo")}</span> {t("fig")}
            <br />
            {t("figNote")}
          </p>
        </div>
      </HeroOptics>
      <a className="ob-scroll-cue" href="#ob-bench" data-ob-jump="bench">
        {t("scrollCue")} <Arrow dir="d" />
      </a>
    </section>
  );
}
