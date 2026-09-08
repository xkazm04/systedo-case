/* ---------------------------------------------------------------------------
   /lp/instrument — VARIANT C: INTERACTION. The visitor operates the page.
   Patterns P3 P7 P12 P5 from docs/design/nextgen-landing.md, unblended: no
   film, no specimen numbering. If this page works, it is because a visitor
   pressed the button that is their own business and watched the product
   become theirs.

   References (P8): DESIGN.md (the world); Nate's "one has a sidebar" (V3
   03:00); the astra showcase's fixed 210px rail (R1 website/src/styles.css).

   The composer derives every type's view on the server (derive.ts) and hands
   plain data to the one client island. Locale is resolved here, once.
--------------------------------------------------------------------------- */
import { getServerLocale } from "@/lib/i18n/locale";
import { deriveInstrument } from "./derive";
import InstrumentBoard from "./InstrumentBoard";

export default async function InstrumentLanding() {
  const locale = await getServerLocale();
  return <InstrumentBoard payload={deriveInstrument(locale)} />;
}
