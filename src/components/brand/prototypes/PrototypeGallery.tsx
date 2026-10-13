"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { PrototypeChrome, PrototypeFooter } from "./PrototypeChrome";

const T = {
  cs: { eyebrow: "ADAMANT / DESIGN EXPLORATIONS / 2026", title: "Nová perspektiva.", sub: "Méně vysvětlování. Více objevování.", orbit: "Váš vlastní vesmír příležitostí.", cinematic: "01 / PROSTOR A POHYB", open: "Prozkoumat návrh", foot: "Prozkoumejte Orbit a vyzkoušejte interaktivní mapu příležitostí." },
  en: { eyebrow: "ADAMANT / DESIGN EXPLORATIONS / 2026", title: "A new perspective.", sub: "Less explaining. More discovering.", orbit: "Your own universe of opportunity.", cinematic: "01 / SPACE & MOTION", open: "Explore direction", foot: "Explore Orbit and try the interactive opportunity map." },
} as const;

export default function PrototypeGallery() {
  const t = useT(T);
  return <div className="proto gallery"><PrototypeChrome active="" /><section className="gallery-intro" id="how"><p className="proto-eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("sub")}</p></section><div className="gallery-grid">
    <Link href="/prototypes/orbit" className="gallery-card"><div className="gallery-art mini-orbit"><i /><i /><i /><b>◈</b><span>◎</span><em>↗</em></div><small>{t("cinematic")}</small><h2>Orbit</h2><p>{t("orbit")}</p><span className="gallery-open">{t("open")} ↗</span></Link>
  </div><p className="gallery-note">{t("foot")}</p><PrototypeFooter /></div>;
}
