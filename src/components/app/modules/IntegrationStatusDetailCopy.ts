/** The `detail` copy tables of IntegrationStatusModule, both locales — a nuance
 *  sentence per IntDetail case. Extracted verbatim from that file so the module
 *  stays under the 200-line component ceiling (rubric A1) as connectors gain
 *  nuances; the record is typed against the same closed `IntDetail` union, so a
 *  new case still fails `typecheck` here instead of shipping a raw slug. Data
 *  only — no hooks, no handlers, so it stays a server-safe import. */
import type { SupportedLocale } from "@/lib/format";
import type { IntDetail } from "@/lib/integrations/compute";

export const DETAIL_COPY: Record<SupportedLocale, Record<IntDetail, string>> = {
  cs: {
    "ads-unlinked": "Platforma je nastavená, ale tento projekt nemá připojený účet Google Ads.",
    "social-demo-linkable": "Připojen jen ukázkový účet — příspěvky nikam neodejdou. Přihlaste reálný účet.",
    "social-demo-only": "Ukázkové připojení: celý tok funguje, ale bez přihlašovacích údajů poskytovatele se nepublikuje na reálnou síť.",
    "social-no-accounts": "Přihlašovací údaje jsou nastavené, žádný účet ale zatím není připojený.",
    "byom-incident": "Vlastní klíč hlásí chyby. Ověřte ho v Nastavení.",
    "byom-stale": "Vlastní klíč byl ověřen před více než 30 dny — to už není důkaz. Ověřte ho znovu.",
    "byom-unvalidated": "Vlastní klíč je uložený, ale nikdy nebyl úspěšně otestován.",
    "sklik-user-token": "Váš token je uložený a denní synchronizace je naplánovaná. Poslední úspěšný běh se zatím nikde nezaznamenává.",
    "sklik-env-token": "Běží na tokenu celé instalace (ne na vašem vlastním). Připojte svůj účet níže.",
    "sklik-none": "Bez API tokenu, ale funkční: export do CSV, návrhy klíčových slov i adaptér pro import dat. Token zapne živé napojení účtu.",
    "gbp-none": "Naimportujte Google Business Profile v modulu Mapa. Pak se recenze a pobočky propíší živě.",
    "microsite-sample": "Mikrostránka běží na ukázkové řadě — je označená a neindexuje se. Po synchronizaci dat ukáže reálná čísla.",
    "microsite-off": "Veřejná mikrostránka klienta zatím není publikovaná.",
    "leads-csv-active": "Kontakty v projektu jsou. Další dávku naimportujete na kartě Napojení.",
    "leads-csv-idle": "Funguje bez přihlašovacích údajů: vložte CSV nebo zadejte kontakt ručně. Opakovaný import stejného souboru nic nezduplikuje.",
    "leads-planned": "Připravujeme. Podmínky a omezení najdete na kartě Napojení — přečtěte si je dřív, než na tento kanál vsadíte.",
    "webhooks-none": "Upozornění, souhrny a reporty tohoto projektu můžete dostávat na vlastní adresu jako podepsaný JSON. Zatím žádný cíl.",
    "webhooks-failing": "Cíl je nastavený, ale poslední doručení selhalo — upozornění nikam nedorazila. Zkontrolujte historii v Nastavení.",
    "inbound-none": "Zprávy z kanálů zatím zadáváte ručně. Ve Schránce si můžete vygenerovat podepsanou adresu, na kterou je platforma pošle sama.",
    "inbound-live": "Adresa pro příjem je aktivní: podepsané zprávy padají rovnou do Schránky jako návrhy čekající na vaši odpověď.",
    "conversion-upload-active":
      "Účet je připojený a konverze se vracejí zpět: kvalifikované a uzavřené obchody z CRM se každý den nahrávají do vaší konverzní akce (ID kliknutí, čas, hodnota).",
    "conversion-upload-off":
      "Účet je připojený, ale konverze se zatím nevracejí — čteme kampaně, nic neodesíláme. Zapnout jde v Nastavení; nahrání je nevratné, takže to chce zkušební běh a schválení.",
  },
  en: {
    "ads-unlinked": "The platform is configured, but this project has no Google Ads account linked.",
    "social-demo-linkable": "Only a demo account is linked — posts go nowhere. Connect a real account.",
    "social-demo-only": "Demo connection: the whole flow works, but without provider credentials nothing publishes to a real network.",
    "social-no-accounts": "Credentials are configured, but no account is linked yet.",
    "byom-incident": "Your own key is reporting failures. Re-check it in Settings.",
    "byom-stale": "Your own key was validated over 30 days ago — that is no longer evidence. Test it again.",
    "byom-unvalidated": "Your own key is stored but has never passed a test.",
    "sklik-user-token": "Your token is stored and the daily sync is scheduled. The last successful run is not recorded anywhere yet.",
    "sklik-env-token": "Running on the deployment-wide token, not your own. Connect your account below.",
    "sklik-none": "No API token, yet functional: CSV export, keyword suggestions and a data-in adapter all ship. A token turns on live account sync.",
    "gbp-none": "Import your Google Business Profile in the Map module. Reviews and locations then flow in live.",
    "microsite-sample": "The microsite runs on the sample series — disclosed and not indexed. It shows real figures once data is synced.",
    "microsite-off": "No public client microsite is published yet.",
    "leads-csv-active": "This project holds contacts. Import the next batch on the Connections tab.",
    "leads-csv-idle": "Works with no credentials at all: paste a CSV or enter a contact by hand. Re-importing the same file duplicates nothing.",
    "leads-planned": "Coming soon. The conditions and limits are on the Connections tab — read them before betting on this channel.",
    "webhooks-none": "This project's alerts, digests and reports can be POSTed to your own URL as signed JSON. No destination yet.",
    "webhooks-failing": "A destination is configured, but the last delivery failed — the alerts reached nobody. Check the history in Settings.",
    "inbound-none": "Messages from your channels are still entered by hand. The Inbox can mint a signed address a platform posts them to itself.",
    "inbound-live": "Intake is live: signed messages land straight in the Inbox as drafts awaiting your reply.",
    "conversion-upload-active":
      "The account is linked and conversions flow back: qualified and won CRM deals are uploaded to your conversion action daily (click ID, time, value).",
    "conversion-upload-off":
      "The account is linked, but conversions don't flow back yet — we read campaigns and send nothing. Turn it on in Settings; an upload cannot be undone, so it takes a dry run and an approval.",
  },
};
