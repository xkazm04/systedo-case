/** Step 8 — read the grounding the SERVER hands the client, without a browser.
 *
 *  The tailor request is built client-side from the `grounding` prop `/kanaly`
 *  renders, so that prop IS the wire request. Fetching the page and pulling the
 *  object out of the RSC payload measures the grounding decision directly —
 *  no model call, no cache, no flaky renderer. Used for the leg the fix does NOT
 *  close (the persisted STARTER catalog), so the report can show the after-state
 *  honestly rather than inferring it. */
const BASE = process.env.BASE_URL ?? "http://localhost:3108";
const PROFILE = {
  businessName: "Fakturoid",
  summary:
    "Fakturoid je online nástroj pro jednoduché vystavování faktur a správu financí drobných podnikatelů a firem.",
  offering: "Online fakturace s QR kódem, správa nákladů a výdajů, párování plateb",
  audience: "OSVČ a firmy v ČR a na Slovensku",
  toneOfVoice: "přátelský a jednoduchý",
  keywords: ["fakturace online", "vystavit fakturu", "fakturační program"],
  competitors: [],
  scannedUrl: "fakturoid.cz",
};

async function probe(type, { applyScan }) {
  const created = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `Probe ${type} ${Date.now()}`, type }),
  });
  const id = (await created.json()).project.id;
  if (applyScan) {
    const r = await fetch(`${BASE}/api/projects/${id}/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scan: PROFILE }),
    });
    if (!r.ok) throw new Error(`onboarding apply → ${r.status}`);
  }
  const html = await (await fetch(`${BASE}/app/${id}/kanaly`)).text();
  // The prop travels in the flight payload as an escaped JSON fragment; find the
  // grounding object by its own keys rather than by position.
  const un = html.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  const m =
    un.match(/"grounding":(\{.*?\}),"signpost"/s) ??
    un.match(/\{"offering":.*?\}(?=,"signpost")/s);
  return { id, type, applyScan, grounding: m ? m[1] ?? m[0] : "NOT FOUND" };
}

for (const c of [
  { type: "leadgen", applyScan: false },
  { type: "app", applyScan: true },
  { type: "eshop", applyScan: true },
]) {
  const r = await probe(c.type, c);
  console.log(`\n=== ${r.type} (scan applied: ${r.applyScan}) — ${r.id}`);
  console.log(r.grounding);
}
