"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { PrototypeChrome, PrototypeFooter } from "./PrototypeChrome";

const T = {
  cs: { eyebrow: "MALÁ ZNAČKA. VELKÝ DOJEM.", title: "Máte co\nukázat.", italic: "Tak do světa.", sub: "Z vašeho webu do míst, kde to žije. Kanály, obsah a kampaně v jednom tvůrčím prostoru.", cta: "Rozhýbat svou značku", sticker: "DOBRÉ NÁPADY\nSI ZASLOUŽÍ PUBLIKUM", sample: "Fiktivní značka / Ukázka kreativního směru", mood: "Změňte náladu", citrus: "Citrus", berry: "Lesní ovoce", mint: "Máta", fresh: "Čerstvý\npohled.", drink: "MALÁ DÁVKA VELKÉ ENERGIE", natural: "JEN DOBRÉ VĚCI.", flow: "JEDNA ZNAČKA. SPOUSTA MOŽNOSTÍ.", how: "Nápad nezůstane\nv poznámkách.", one: "Váš web", two: "Váš plán", three: "Váš obsah", website: "Poznáme, co děláte.", plan: "Najdeme, kde být vidět.", content: "Připravíte, co říct.", directory: "Firemní profily", community: "Komunity", journal: "Články a SEO", available: "Příležitosti bez reklamního rozpočtu", end: "Vaše značka.\nO něco hlasitější.", endsub: "Začněte viditelností zdarma. Reklamu přidejte, až budete chtít." },
  en: { eyebrow: "SMALL BRAND. BIG IMPRESSION.", title: "You’ve got\nsomething.", italic: "Put it out there.", sub: "From your website to where things happen. Channels, content and campaigns in one creative workspace.", cta: "Make my brand move", sticker: "GOOD IDEAS\nDESERVE AN AUDIENCE", sample: "Fictional brand / Creative direction demo", mood: "Change the mood", citrus: "Citrus", berry: "Berry", mint: "Mint", fresh: "A fresh\nperspective.", drink: "A LITTLE CAN OF BIG ENERGY", natural: "ONLY THE GOOD STUFF.", flow: "ONE BRAND. SO MANY POSSIBILITIES.", how: "Get that idea\nout of your notes.", one: "Your website", two: "Your plan", three: "Your content", website: "We get what you do.", plan: "Find your places to shine.", content: "Create something to say.", directory: "Business profiles", community: "Communities", journal: "Articles & SEO", available: "Opportunities without an ad budget", end: "Your brand.\nA little louder.", endsub: "Start with free visibility. Add advertising when you’re ready." },
} as const;

function Can({ flavor, small = false }: { flavor: string; small?: boolean }) {
  return <div className={`studio-can ${small ? "can-small" : ""}`} aria-hidden="true"><div className="can-top" /><div className="can-label"><small>ADAMANT STUDIO</small><b>a<span>!</span></b><div className="can-fruit">✳</div><strong>{flavor}</strong><small>330 ml · 100% attitude</small></div><div className="can-bottom" /></div>;
}

export default function Studio() {
  const t = useT(T);
  const [flavor, setFlavor] = useState<"citrus" | "berry" | "mint">("citrus");
  const [paused, setPaused] = useState(false);
  return <div className={`proto studio flavor-${flavor} ${paused ? "motion-paused" : ""}`}><PrototypeChrome active="studio" paused={paused} onPause={() => setPaused(!paused)} />
    <section className="studio-hero"><div className="studio-heading"><p className="proto-eyebrow">✳ {t("eyebrow")}</p><h1>{t("title")}<em>{t("italic")}</em></h1><p className="proto-sub">{t("sub")}</p><Button href="/kanaly-zdarma" className="proto-cta">{t("cta")} ↗</Button><span className="studio-handline" aria-hidden="true">⤴</span></div>
      <div className="studio-art"><div className="studio-poster"><span className="poster-brand">a! / {t(flavor)}</span><strong>{t("fresh")}</strong><div className="poster-sun" /><Can flavor={t(flavor)} /><span className="poster-bottom">{t("drink")}</span></div><div className="studio-social"><span>◈ &nbsp; a! drinks <b>↗</b></span><div className="social-art"><Can flavor={t(flavor)} small /><span>✳</span></div><strong>{t("natural")}</strong><small>♡ &nbsp; ◯ &nbsp; ↗ <span>▱</span></small></div><div className="studio-sticker">{t("sticker")}<b>↗</b></div><div className="studio-art-caption">{t("sample")}</div></div>
    </section><div className="studio-palette"><span>{t("mood")} ↗</span><div role="group" aria-label={t("mood")}>{(["citrus", "berry", "mint"] as const).map(f => <Button key={f} variant="ghost" className={`swatch swatch-${f}`} onClick={() => setFlavor(f)} aria-pressed={flavor === f}><i />{t(f)}</Button>)}</div><span className="palette-code">AD / STUDIO — 002</span></div>
    <div className="studio-ribbon" aria-hidden="true"><span>✳ {t("flow")} ↗ {t("flow")} ✳ {t("flow")}</span></div>
    <section className="studio-how" id="how"><p className="proto-eyebrow">{t("available")}</p><h2>{t("how")}</h2><div className="studio-process"><article><small>01 / {t("one")}</small><div className="studio-browser"><div>● ● ●</div><b>your-brand.cz</b><span>◈</span></div><h3>{t("website")}</h3></article><article><small>02 / {t("two")}</small><div className="studio-plan">{["directory", "community", "journal"].map((key, i) => <div key={key}><span>{["◎", "✳", "↗"][i]}</span>{t(key as "directory")}<b>↗</b></div>)}</div><h3>{t("plan")}</h3></article><article><small>03 / {t("three")}</small><div className="studio-output"><span>✳</span><b>{t("fresh")}</b><i>↗</i></div><h3>{t("content")}</h3></article></div></section>
    <section className="proto-closing"><span className="closing-spark" aria-hidden="true">✳</span><h2>{t("end")}</h2><p>{t("endsub")}</p><Button href="/kanaly-zdarma" className="proto-cta">{t("cta")} ↗</Button></section><PrototypeFooter />
  </div>;
}
