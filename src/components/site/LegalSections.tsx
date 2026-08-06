import { Fragment } from "react";
import { interpolate } from "@/lib/i18n/interpolate";
import type { SupportedLocale } from "@/lib/format";

/** One section of a legal document: a heading, paragraphs, optional bullets.
 *  Strings may carry `{support}` / `{sales}` placeholders for the canonical
 *  contact addresses (kept in lib/site.ts — E1: one brand, one domain). */
export interface LegalSection {
  title: string;
  paras: string[];
  bullets?: string[];
}

/** Shared renderer for the legal pages (/ochrana-osobnich-udaju, /podminky) so
 *  both documents keep identical typography. Server component — no client JS.
 *  E-mail addresses in the text render as mailto links automatically. */
export function LegalSections({
  sections,
  supportEmail,
  salesEmail,
}: {
  sections: readonly LegalSection[];
  supportEmail: string;
  salesEmail: string;
}) {
  const vars = { support: supportEmail, sales: salesEmail };
  return (
    <div className="mt-10 space-y-10">
      {sections.map((s) => (
        <section key={s.title}>
          <h2 className="text-xl font-semibold tracking-tight text-navy-800">{s.title}</h2>
          {s.paras.map((p) => (
            <p key={p} className="mt-3 max-w-3xl text-[15px] leading-relaxed text-navy-700">
              <Linkified text={interpolate(p, vars)} />
            </p>
          ))}
          {s.bullets && (
            <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-navy-700">
              {s.bullets.map((b) => (
                <li key={b}>
                  <Linkified text={interpolate(b, vars)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

const EMAIL_RE = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;

/** Wraps e-mail addresses in a text run with mailto links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(EMAIL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={`${part}-${i}`}
            href={`mailto:${part}`}
            className="font-medium text-brand-accent hover:text-brand-800"
          >
            {part}
          </a>
        ) : (
          <Fragment key={`t-${i}`}>{part}</Fragment>
        )
      )}
    </>
  );
}

/** The legal copy itself — documents SHIPPED behavior only. Structured per
 *  locale so the pages stay bilingual without a translation framework. `en` is
 *  the authoring source and `cs` is transcreated from it (docs/i18n/contract.md,
 *  reversed 2026-08-05). Note this table is `LEGAL_CONTENT`, not `T` — the i18n
 *  tooling identifies a locale table by its `cs:`/`en:` columns, not its name. */
export const LEGAL_CONTENT: Record<
  SupportedLocale,
  { privacy: readonly LegalSection[]; terms: readonly LegalSection[] }
> = {
  cs: {
    privacy: [
      {
        title: "Kdo údaje spravuje",
        paras: [
          "Provozovatelem aplikace Adamant a správcem osobních údajů je Adamant. Kontakt pro podporu a žádosti týkající se údajů: {support}. Obchodní kontakt: {sales}.",
        ],
      },
      {
        title: "Jaké údaje zpracováváme",
        paras: ["Zpracováváme pouze údaje potřebné k provozu aplikace:"],
        bullets: [
          "Účet: přihlašujete se účtem Google (Auth.js / next-auth). Z profilu Google ukládáme jméno, e-mail a avatar do databáze Firestore.",
          "OAuth tokeny Google: pro synchronizaci reklamních dat ukládáme přístupový a obnovovací token (včetně rozsahu Google Ads, pokud jej udělíte) ve Firestore. Používají se výhradně k načítání vašich dat a lze je kdykoli odvolat v účtu Google.",
          "Vlastní API klíče (BYOM): klíč k OpenAI, Gemini nebo Claude ukládáme šifrovaný algoritmem AES-256-GCM; do prohlížeče se nikdy nevrací v čitelné podobě a můžete jej v aplikaci kdykoli smazat.",
          "Data reklamních platforem: kampaně a metriky z Google Ads, které si připojíte, a texty inzerátů pro kontroly limitů Sklik.",
          "Obsah, který vytvoříte: projekty, briefy, články, návrhy inzerátů a další výstupy — uložené ve Firestore v rámci vašeho projektu.",
          "E-mail: transakční upozornění a reporty odesíláme přes službu Resend na e-mail vašeho účtu. Žádné marketingové newslettery.",
        ],
      },
      {
        title: "Cookies a lokální úložiště",
        paras: [
          "Aplikace používá cookie relace (přihlášení, Auth.js), cookie „locale“ (volba jazyka cs/en) a záznam „theme“ v localStorage (volba vzhledu). Žádné sledovací, reklamní ani analytické cookies nenasazujeme.",
        ],
      },
      {
        title: "Zpracovatelé a příjemci",
        paras: ["Údaje zpracovávají pouze poskytovatelé infrastruktury, bez kterých služba nefunguje:"],
        bullets: [
          "Google (Firestore, přihlášení přes OAuth, Google Ads API; vestavěné AI generování běží přes Google Gemini)",
          "Vercel (hosting aplikace)",
          "Resend (odesílání transakčních e-mailů)",
          "Váš zvolený poskytovatel AI (OpenAI, Google, Anthropic) — pouze pokud si připojíte vlastní API klíč",
        ],
      },
      {
        title: "Právní základ a účel",
        paras: [
          "Údaje zpracováváme pro plnění smlouvy (provoz aplikace, kterou používáte) a z oprávněného zájmu (zabezpečení, prevence zneužití, provozní e-maily). Údaje neprodáváme ani nepředáváme k reklamním účelům.",
        ],
      },
      {
        title: "Ukázková data",
        paras: [
          "Klient Mionelo a všechna čísla ve veřejných ukázkách jsou fiktivní, ilustrativní data vytvořená pro předvedení produktu. Nejde o osobní údaje ani o výsledky reálného zákazníka.",
        ],
      },
      {
        title: "Uchování a smazání",
        paras: [
          "Údaje uchováváme po dobu existence účtu. Smazání účtu je nevratné a zpracováváme ho ručně — žádost pošlete z e-mailu svého účtu na {support} (pokyny najdete i v aplikaci v sekci Účet a zabezpečení). Smazáním se odstraní projekty, data i uložené tokeny a klíče.",
        ],
      },
      {
        title: "Vaše práva",
        paras: [
          "Máte právo na přístup ke svým údajům, jejich opravu, výmaz, přenositelnost a právo vznést námitku. Žádosti vyřizujeme na {support}. Máte také právo podat stížnost u Úřadu pro ochranu osobních údajů (uoou.gov.cz).",
        ],
      },
      {
        title: "Změny tohoto dokumentu",
        paras: [
          "Při podstatné změně zpracování údajů tento dokument aktualizujeme a změnu oznámíme v aplikaci. Datum účinnosti je uvedeno v záhlaví.",
        ],
      },
    ],
    terms: [
      {
        title: "Kdo službu poskytuje",
        paras: [
          "Službu Adamant poskytuje Adamant. Kontakt pro podporu: {support}. Obchodní kontakt: {sales}.",
        ],
      },
      {
        title: "Co je Adamant",
        paras: [
          "Adamant je AI pracovní prostor pro reklamu: výkonnostní dashboardy, triáž kampaní a generování reklamních podkladů opřené o data účtu. Úroveň podpory kanálů je odstupňovaná a uvádíme ji vždy výslovně: Google Ads je živý datový konektor, Sklik má kontroly limitů inzerátů, Meta a TikTok jsou publikační plochy.",
        ],
      },
      {
        title: "Cena — zdarma během validace",
        paras: [
          "Adamant je v současné validační fázi zdarma v plném rozsahu, s férovými denními limity uvedenými na stránce /cena. Placené plány spustíme až po ověření produktu; nic vám nenaúčtujeme bez předchozího výslovného souhlasu.",
        ],
      },
      {
        title: "Účet",
        paras: [
          "Přihlašujete se účtem Google a odpovídáte za činnost pod svým účtem. Účet je určen pro jednu osobu; přístup ke sdíleným projektům řešte pozváním, ne sdílením přihlášení.",
        ],
      },
      {
        title: "Připojené účty a vaše data",
        paras: [
          "Připojujte pouze reklamní účty a zdroje dat, ke kterým máte oprávnění. K připojeným účtům přistupujeme výhradně kvůli poskytování služby a přístup můžete kdykoli odvolat. Vaše data zůstávají vaše.",
        ],
      },
      {
        title: "Vlastní API klíče (BYOM)",
        paras: [
          "Pokud připojíte vlastní API klíč poskytovatele AI, náklady na tokeny hradíte přímo poskytovateli podle jeho podmínek. Klíč ukládáme šifrovaný a můžete ho kdykoli smazat.",
        ],
      },
      {
        title: "Výstupy AI",
        paras: [
          "Generovaný obsah může být nepřesný. Před publikováním ho zkontrolujte — odpovědnost za to, co zveřejníte, nesete vy. Ke svým vstupům i výstupům máte práva v rozsahu, v jakém je můžeme poskytnout.",
        ],
      },
      {
        title: "Ukázková data",
        paras: [
          "Klient Mionelo je fiktivní a všechna ukázková čísla jsou ilustrativní. Nepředstavují slib výsledků, kterých s aplikací dosáhnete.",
        ],
      },
      {
        title: "Pravidla užívání",
        paras: [
          "Službu nesmíte používat k protiprávní činnosti, obcházení limitů či zabezpečení, ani způsobem, který ji poškozuje nebo nadměrně zatěžuje.",
        ],
      },
      {
        title: "Dostupnost a odpovědnost",
        paras: [
          "Služba je ve validační fázi a poskytuje se „tak, jak je“, bez garance dostupnosti (SLA). Funkce se mohou měnit nebo být ukončeny. V rozsahu povoleném právem neodpovídáme za nepřímé škody ani ušlý zisk; služba je zdarma a tomu odpovídá i rozsah odpovědnosti.",
        ],
      },
      {
        title: "Ukončení a smazání",
        paras: [
          "Účet můžete kdykoli nechat smazat žádostí na {support} (nevratně, včetně dat). My můžeme ukončit účet porušující tyto podmínky.",
        ],
      },
      {
        title: "Změny podmínek a právo",
        paras: [
          "Podmínky můžeme aktualizovat; podstatné změny oznámíme v aplikaci předem. Podmínky se řídí právem České republiky.",
        ],
      },
    ],
  },
  en: {
    privacy: [
      {
        title: "Who controls your data",
        paras: [
          "The Adamant app is operated by Adamant, which acts as the data controller. Support and data requests: {support}. Sales: {sales}.",
        ],
      },
      {
        title: "What we process",
        paras: ["We only process the data the app needs to work:"],
        bullets: [
          "Account: you sign in with a Google account (Auth.js / next-auth). We store your Google profile name, e-mail and avatar in Firestore.",
          "Google OAuth tokens: to sync ad data we store your access and refresh token (including the Google Ads scope, if you grant it) in Firestore. They are used solely to fetch your data and can be revoked in your Google account at any time.",
          "Your own API keys (BYOM): an OpenAI, Gemini or Claude key is stored encrypted with AES-256-GCM; the plaintext is never returned to the browser, and you can delete the key in the app at any time.",
          "Ad platform data: the Google Ads campaigns and metrics you connect, and ad copy submitted to Sklik limit checks.",
          "Content you create: projects, briefs, articles, ad drafts and other outputs — stored in Firestore inside your project.",
          "E-mail: transactional alerts and reports are sent via Resend to your account e-mail. No marketing newsletters.",
        ],
      },
      {
        title: "Cookies and local storage",
        paras: [
          "The app uses a session cookie (sign-in, Auth.js), a “locale” cookie (cs/en language choice) and a “theme” entry in localStorage (appearance choice). We deploy no tracking, advertising or analytics cookies.",
        ],
      },
      {
        title: "Processors and recipients",
        paras: ["Data is handled only by the infrastructure providers the service cannot run without:"],
        bullets: [
          "Google (Firestore, OAuth sign-in, Google Ads API; built-in AI generation runs on Google Gemini)",
          "Vercel (application hosting)",
          "Resend (transactional e-mail delivery)",
          "Your chosen AI provider (OpenAI, Google, Anthropic) — only if you connect your own API key",
        ],
      },
      {
        title: "Legal basis and purpose",
        paras: [
          "We process data to perform the contract (running the app you use) and on legitimate interest (security, abuse prevention, operational e-mail). We do not sell data or share it for advertising purposes.",
        ],
      },
      {
        title: "Demo data",
        paras: [
          "The client Mionelo and all figures in the public demos are fictional, illustrative data created to present the product. They are not personal data and not a real customer's results.",
        ],
      },
      {
        title: "Retention and deletion",
        paras: [
          "We keep data for as long as your account exists. Account deletion is irreversible and handled manually — send the request from your account e-mail to {support} (instructions are also in the app under Account & security). Deletion removes projects, data, stored tokens and keys.",
        ],
      },
      {
        title: "Your rights",
        paras: [
          "You have the right to access, rectify, erase and port your data, and to object to processing. Requests go to {support}. You may also lodge a complaint with the Czech Office for Personal Data Protection (uoou.gov.cz).",
        ],
      },
      {
        title: "Changes to this policy",
        paras: [
          "If the processing changes materially, we update this document and announce the change in the app. The effective date is shown in the header.",
        ],
      },
    ],
    terms: [
      {
        title: "Who provides the service",
        paras: ["The Adamant service is provided by Adamant. Support: {support}. Sales: {sales}."],
      },
      {
        title: "What Adamant is",
        paras: [
          "Adamant is an AI workspace for advertising: performance dashboards, campaign triage and ad-asset generation grounded in account data. Channel support is tiered and always stated explicitly: Google Ads is a live data connector, Sklik gets ad-copy limit checks, Meta and TikTok are publishing surfaces.",
        ],
      },
      {
        title: "Pricing — free during validation",
        paras: [
          "Adamant is currently free in full during the validation phase, with fair daily limits listed on the /cena page. Paid plans will launch only after the product is validated; you will never be charged without prior explicit consent.",
        ],
      },
      {
        title: "Account",
        paras: [
          "You sign in with a Google account and are responsible for activity under your account. An account is for one person; share projects by invitation, not by sharing the login.",
        ],
      },
      {
        title: "Connected accounts and your data",
        paras: [
          "Only connect ad accounts and data sources you are authorized to use. We access connected accounts solely to provide the service, and you can revoke access at any time. Your data stays yours.",
        ],
      },
      {
        title: "Your own API keys (BYOM)",
        paras: [
          "If you connect your own AI provider key, you pay token costs directly to the provider under its terms. The key is stored encrypted and you can delete it at any time.",
        ],
      },
      {
        title: "AI output",
        paras: [
          "Generated content can be inaccurate. Review it before publishing — you are responsible for what you publish. You retain rights to your inputs and outputs to the extent we can grant them.",
        ],
      },
      {
        title: "Demo data",
        paras: [
          "The client Mionelo is fictional and all demo figures are illustrative. They are not a promise of the results you will achieve with the app.",
        ],
      },
      {
        title: "Acceptable use",
        paras: [
          "You may not use the service for unlawful activity, to circumvent limits or security, or in a way that damages or overloads it.",
        ],
      },
      {
        title: "Availability and liability",
        paras: [
          "The service is in a validation phase and is provided “as is”, with no availability guarantee (SLA). Features may change or be discontinued. To the extent permitted by law we are not liable for indirect damages or lost profit; the service is free and the scope of liability reflects that.",
        ],
      },
      {
        title: "Termination and deletion",
        paras: [
          "You can have your account deleted at any time by writing to {support} (irreversible, including data). We may terminate accounts that violate these terms.",
        ],
      },
      {
        title: "Changes and governing law",
        paras: [
          "We may update these terms; material changes will be announced in the app in advance. These terms are governed by the law of the Czech Republic.",
        ],
      },
    ],
  },
};
