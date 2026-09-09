"use client";

import Link from "next/link";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const T = {
  cs: { concepts: "Všechny návrhy", start: "Začít zdarma", product: "Jak to funguje", login: "Přihlásit se", note: "Interaktivní návrh · Ukázková data", free: "Zdarma během ověřování produktu", back: "Současný web", language: "Switch to English", pause: "Pozastavit pohyb", play: "Spustit pohyb" },
  en: { concepts: "All explorations", start: "Start for free", product: "How it works", login: "Sign in", note: "Interactive prototype · Sample data", free: "Free during product validation", back: "Current website", language: "Přepnout do češtiny", pause: "Pause motion", play: "Resume motion" },
} as const;

export function PrototypeChrome({ active, paused, onPause }: { active: string; paused?: boolean; onPause?: () => void }) {
  const t = useT(T);
  const { locale, setLocale } = useLocale();
  return <>
    <div className="proto-review"><Link href="/prototypes">↖ {t("concepts")}</Link><div className="proto-directions">{["orbit"].map((name, i) => <Link key={name} href={`/prototypes/${name}`} aria-current={active === name ? "page" : undefined}>0{i + 1} <span>{name}</span></Link>)}</div><Button variant="ghost" className="proto-locale" onClick={() => setLocale(locale === "en" ? "cs" : "en")} aria-label={t("language")}>{locale === "en" ? "CS" : "EN"}</Button></div>
    <header className="proto-nav"><Link className="proto-logo" href="/prototypes"><span aria-hidden="true">◈</span> adamant<span className="proto-logo-dot">®</span></Link><nav><a href="#how">{t("product")}</a><Link href="/app">{t("login")}</Link></nav><Button href="/kanaly-zdarma" className="proto-cta">{t("start")} <span aria-hidden="true">↗</span></Button></header>
    {onPause && <Button variant="ghost" className="proto-motion" onClick={onPause} aria-label={paused ? t("play") : t("pause")} aria-pressed={paused}>{paused ? "▶" : "Ⅱ"}</Button>}
  </>;
}

export function PrototypeFooter() {
  const t = useT(T);
  return <footer className="proto-footer"><span>◈ adamant <small>{t("free")}</small></span><span>{t("note")}</span><Link href="/">{t("back")} ↗</Link></footer>;
}
