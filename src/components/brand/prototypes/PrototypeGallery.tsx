"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { PrototypeChrome, PrototypeFooter } from "./PrototypeChrome";

const T = {
  cs: { eyebrow: "ADAMANT / DESIGN EXPLORATIONS / 2026", title: "Jeden produkt.\nTři nové perspektivy.", sub: "Méně vysvětlování. Více objevování.", orbit: "Váš vlastní vesmír příležitostí.", studio: "Z nápadu do světa. V barvách.", signal: "Méně šumu. Jasný další krok.", cinematic: "01 / PROSTOR A POHYB", editorial: "02 / KREATIVNÍ STUDIO", system: "03 / ŘÍZENÍ A PŘEHLED", open: "Prozkoumat návrh", foot: "Tři funkční vizuální směry pro nový úvodní web. Vyberte si a vyzkoušejte interakce." },
  en: { eyebrow: "ADAMANT / DESIGN EXPLORATIONS / 2026", title: "One product.\nThree new perspectives.", sub: "Less explaining. More discovering.", orbit: "Your own universe of opportunity.", studio: "From an idea to out there. In color.", signal: "Less noise. A clear next move.", cinematic: "01 / SPACE & MOTION", editorial: "02 / CREATIVE STUDIO", system: "03 / CLARITY & CONTROL", open: "Explore direction", foot: "Three working visual directions for a new front door. Pick one and try the interactions." },
} as const;

export default function PrototypeGallery() {
  const t = useT(T);
  return <div className="proto gallery"><PrototypeChrome active="" /><section className="gallery-intro" id="how"><p className="proto-eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("sub")}</p></section><div className="gallery-grid">
    <Link href="/prototypes/orbit" className="gallery-card"><div className="gallery-art mini-orbit"><i /><i /><i /><b>◈</b><span>◎</span><em>↗</em></div><small>{t("cinematic")}</small><h2>Orbit</h2><p>{t("orbit")}</p><span className="gallery-open">{t("open")} ↗</span></Link>
    <Link href="/prototypes/studio" className="gallery-card"><div className="gallery-art mini-studio"><b>Make<br /><i>some</i><br />noise.</b><span className="mini-can">a.</span><em>✳</em></div><small>{t("editorial")}</small><h2>Studio</h2><p>{t("studio")}</p><span className="gallery-open">{t("open")} ↗</span></Link>
    <Link href="/prototypes/signal" className="gallery-card"><div className="gallery-art mini-signal"><div className="mini-grid" /><b>↗</b><span>01 — 02 — 03</span></div><small>{t("system")}</small><h2>Signal</h2><p>{t("signal")}</p><span className="gallery-open">{t("open")} ↗</span></Link>
  </div><p className="gallery-note">{t("foot")}</p><PrototypeFooter /></div>;
}
