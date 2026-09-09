"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { PrototypeChrome, PrototypeFooter } from "./PrototypeChrome";

const T = {
  cs: { eyebrow: "VELKÉ AMBICE. ŽÁDNÝ REKLAMNÍ ROZPOČET.", title: "Váš další zákazník\nje někde tam venku.", sub: "Dejte svému webu vlastní gravitaci.", cta: "Najít své příležitosti", explore: "Prozkoumat oběžnou dráhu", core: "VÁŠ WEB", map: "MAPA VIDITELNOSTI", sample: "Ukázkový plán pro lokální pražírnu", channels: "Volné kanály", content: "Obsah", growth: "Kampaně", channelsTitle: "Správné místo. První kontakt.", channelsText: "Firemní profily, oborové katalogy a komunity, kde vás mohou objevit.", contentTitle: "Váš příběh dostane hlas.", contentText: "Články a příspěvky vycházející z vaší nabídky a tónu značky.", growthTitle: "Až budete chtít přidat plyn.", growthText: "Google Ads a Sklik v jednom přehledu. Další krok vychází z dat.", strip1: "Jeden web", strip2: "Nové příležitosti", strip3: "Váš další krok", how: "Malý vstup.\nNový svět možností.", step1: "Vložte svůj web", step2: "Objevte vhodné kanály", step3: "Vyberte první krok", end: "Ať vás svět najde.", noaccount: "Začněte bez připojení reklamního účtu.", profile: "Firemní profil", community: "Komunity", article: "Články", social: "Sociální sítě", selected: "Vybraná oblast" },
  en: { eyebrow: "BIG AMBITIONS. NO AD BUDGET REQUIRED.", title: "Your next customer\nis out there.", sub: "Give your website a gravitational pull.", cta: "Find my opportunities", explore: "Explore the orbit", core: "YOUR WEBSITE", map: "VISIBILITY MAP", sample: "Sample plan for a local coffee roaster", channels: "Free channels", content: "Content", growth: "Campaigns", channelsTitle: "Right place. First hello.", channelsText: "Business profiles, niche directories and communities where people can find you.", contentTitle: "Give your story a voice.", contentText: "Articles and social posts shaped by your products and your brand voice.", growthTitle: "When you’re ready for more.", growthText: "Google Ads and Sklik in one view. Your next move, grounded in data.", strip1: "One website", strip2: "New possibilities", strip3: "Your next move", how: "A small input.\nA world of possibility.", step1: "Add your website", step2: "Discover relevant channels", step3: "Choose your first move", end: "Let the world find you.", noaccount: "Start without connecting an ad account.", profile: "Business profile", community: "Communities", article: "Articles", social: "Social", selected: "Selected area" },
} as const;
const AREAS = ["channels", "content", "growth"] as const;

export default function Orbit() {
  const t = useT(T);
  const [area, setArea] = useState<(typeof AREAS)[number]>("channels");
  const [paused, setPaused] = useState(false);
  const labels = area === "channels" ? ["Google", "Firmy.cz", t("community"), t("profile")] : area === "content" ? [t("article"), "Instagram", t("social"), "SEO"] : ["Google Ads", "Sklik", "ROAS", "PPC"];
  return <div className={`proto orbit ${paused ? "motion-paused" : ""}`}><PrototypeChrome active="orbit" paused={paused} onPause={() => setPaused(!paused)} />
    <section className="orbit-hero"><div className="orbit-heading"><p className="proto-eyebrow"><i className="status-dot" />{t("eyebrow")}</p><h1>{t("title")}</h1><p className="proto-sub">{t("sub")}</p><Button href="/kanaly-zdarma" className="proto-cta">{t("cta")} ↗</Button></div>
      <div className="orbit-universe" aria-label={t("map")}><div className="orbit-stars" /><div className="orbital-plane"><i /><i /><i /></div><div className="orbit-beam" /><div className="orbit-planet"><div className="planet-grid" /><span>◈</span></div><span className="orbit-core">{t("core")}<b>your-brand.cz</b></span>
        {labels.map((label, i) => <div className={`orbit-satellite satellite-${i}`} key={`${area}-${i}`}><span aria-hidden="true">{["G", "↗", "◎", "✳"][i]}</span><b>{label}</b><small>{t(area)}</small></div>)}<span className="orbit-coordinate">50°05′ N &nbsp; 14°25′ E<br />ADAMANT / {t("map")}</span>
      </div><div className="orbit-controls"><span>{t("explore")} ↓</span><div role="group" aria-label={t("selected")}>{AREAS.map((key, i) => <Button key={key} variant="ghost" onClick={() => setArea(key)} aria-pressed={area === key}>0{i + 1} {t(key)}</Button>)}</div></div>
    </section>
    <section className="orbit-detail" aria-live="polite"><span className="proto-eyebrow">{t("sample")}</span><h2>{t(`${area}Title`)}</h2><p>{t(`${area}Text`)}</p></section>
    <section className="orbit-how" id="how"><div><p className="proto-eyebrow">01 → 02 → 03</p><h2>{t("how")}</h2></div><div className="orbit-steps">{["step1", "step2", "step3"].map((key, i) => <div key={key}><span className="step-symbol" aria-hidden="true">{["⌘", "◎", "↗"][i]}</span><small>0{i + 1}</small><h3>{t(key as "step1")}</h3></div>)}</div></section>
    <section className="proto-closing"><h2>{t("end")}</h2><p>{t("noaccount")}</p><Button href="/kanaly-zdarma" className="proto-cta">{t("cta")} ↗</Button></section><PrototypeFooter />
  </div>;
}
