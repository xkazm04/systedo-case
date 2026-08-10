/** Unit tests for the Newsletter channel handoff helpers: splitting the generated
 *  „Předmět:" variant into a real subject + body, validating the subject length on
 *  its own budget (independent of the body), and assembling the paste-ready
 *  plain-text + HTML email with the UTM'd CTA. Runs the TS source directly via
 *  the shared resolve hook (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitNewsletter,
  checkSubject,
  newsletterPlainText,
  newsletterHtml,
  NEWSLETTER_SUBJECT_MAX,
  NEWSLETTER_CTA_LABELS,
  NEWSLETTER_SUBJECT_LABELS,
} from "@/lib/distribution/newsletter";
import { repurpose } from "@/lib/distribution/generate";

test("splitNewsletter peels the Predmet prefix into subject + body", () => {
  const { subject, body } = splitNewsletter(
    "Předmět: Spánek miminka\n\nTento týden jsme sepsali průvodce.\n\nČíst → https://x.cz/a"
  );
  assert.equal(subject, "Spánek miminka");
  assert.ok(body.startsWith("Tento týden"), `body was: ${body}`);
  // the subject line never leaks back into the body
  assert.ok(!body.includes("Předmět:"));
});

test("splitNewsletter is case-insensitive and tolerant of CRLF + extra blank lines", () => {
  const { subject, body } = splitNewsletter("předmět:   Ahoj\r\n\r\n\r\nTělo zprávy");
  assert.equal(subject, "Ahoj");
  assert.equal(body, "Tělo zprávy");
});

test("splitNewsletter with no subject marker leaves subject empty, all text is body", () => {
  const { subject, body } = splitNewsletter("Žádný předmět tu není.\nDruhý řádek.");
  assert.equal(subject, "");
  assert.equal(body, "Žádný předmět tu není.\nDruhý řádek.");
});

test("checkSubject validates length on its own budget", () => {
  assert.deepEqual(checkSubject(""), { length: 0, max: NEWSLETTER_SUBJECT_MAX, status: "empty", valid: false });
  const ok = checkSubject("Krátký předmět");
  assert.equal(ok.status, "ok");
  assert.equal(ok.valid, true);
  assert.equal(ok.length, "Krátký předmět".length);
});

test("checkSubject flags over-budget subjects distinctly from empty ones", () => {
  const long = "x".repeat(NEWSLETTER_SUBJECT_MAX + 5);
  const res = checkSubject(long);
  assert.equal(res.status, "tooLong");
  assert.equal(res.valid, false);
  assert.equal(res.length, NEWSLETTER_SUBJECT_MAX + 5);
  // a custom budget is honoured
  assert.equal(checkSubject("abcdef", 5).status, "tooLong");
  assert.equal(checkSubject("abcde", 5).status, "ok");
});

test("checkSubject trims surrounding whitespace before measuring", () => {
  const res = checkSubject("   ahoj   ");
  assert.equal(res.length, 4);
  assert.equal(res.status, "ok");
});

test("newsletterPlainText carries the subject, body and UTM'd CTA", () => {
  const out = newsletterPlainText({
    subject: "Spánek miminka",
    body: "Tělo zprávy.",
    ctaUrl: "https://x.cz/a?utm_source=newsletter",
    locale: "cs",
  });
  assert.ok(out.startsWith("Předmět: Spánek miminka\n"));
  assert.ok(out.includes("Tělo zprávy."));
  assert.ok(out.includes("https://x.cz/a?utm_source=newsletter"));
  assert.ok(out.includes("Číst celý článek"));
});

test("newsletterHtml is valid-ish HTML with the subject, CTA href and escaping", () => {
  const html = newsletterHtml({
    subject: "Tip & trik <b>",
    body: "První odstavec.\n\nDruhý odstavec.",
    ctaUrl: "https://x.cz/a?utm_source=newsletter&utm_campaign=c",
    locale: "cs",
  });
  assert.ok(html.startsWith("<!doctype html>"));
  // subject is HTML-escaped (no raw <b> / &)
  assert.ok(html.includes("Tip &amp; trik &lt;b&gt;"));
  assert.ok(!html.includes("<b>"));
  // the CTA href is present and ampersand-escaped
  assert.ok(html.includes('href="https://x.cz/a?utm_source=newsletter&amp;utm_campaign=c"'));
  // both body paragraphs render
  assert.ok(html.includes("První odstavec."));
  assert.ok(html.includes("Druhý odstavec."));
  // two <p> body paragraphs (blank-line split)
  assert.equal((html.match(/<p style="margin:0 0 16px/g) ?? []).length, 2);
});

test("newsletterHtml round-trips a real split variant", () => {
  const variant =
    "Předmět: Spánek miminka: kompletní průvodce\n\nTento týden jsme sepsali kompletního průvodce.\n\nČíst celý článek → https://blog.example.cz/spanek?utm_source=newsletter";
  const { subject, body } = splitNewsletter(variant);
  const html = newsletterHtml({ subject, body, ctaUrl: "https://blog.example.cz/spanek?utm_source=newsletter", locale: "cs" });
  assert.ok(html.includes("Spánek miminka: kompletní průvodce"));
  assert.ok(html.includes("Tento týden"));
});

test("the generated email carries the CTA of the ACTIVE locale, not a baked-in Czech one", () => {
  const parts = { subject: "Sleep guide", body: "First paragraph.", ctaUrl: "https://x.cz/a?utm_source=newsletter" };

  const cs = newsletterHtml({ ...parts, locale: "cs" });
  assert.ok(cs.includes(NEWSLETTER_CTA_LABELS.cs), "cs email must carry the Czech CTA");
  assert.ok(!cs.includes(NEWSLETTER_CTA_LABELS.en));
  assert.ok(cs.includes('<html lang="cs-CZ"'));

  const en = newsletterHtml({ ...parts, locale: "en" });
  assert.ok(en.includes(NEWSLETTER_CTA_LABELS.en), "en email must carry the English CTA");
  assert.ok(!en.includes(NEWSLETTER_CTA_LABELS.cs), "en email must NOT ship a Czech call-to-action");
  assert.ok(en.includes('<html lang="en-US"'));
});

test("the plain-text handoff localizes both the CTA and the subject label", () => {
  const parts = { subject: "Sleep guide", body: "First paragraph.", ctaUrl: "https://x.cz/a" };

  const cs = newsletterPlainText({ ...parts, locale: "cs" });
  assert.ok(cs.startsWith("Předmět: Sleep guide\n"));
  assert.ok(cs.includes(NEWSLETTER_CTA_LABELS.cs));

  const en = newsletterPlainText({ ...parts, locale: "en" });
  assert.ok(en.startsWith("Subject: Sleep guide\n"));
  assert.ok(en.includes(NEWSLETTER_CTA_LABELS.en));
  assert.ok(!en.includes("Předmět"));
});

test("splitNewsletter parses the subject line of EVERY locale, not just Czech", () => {
  // Once generate.ts writes the subject line in the user's locale, a parser
  // pinned to „Předmět:" would read an en variant as "no subject" and hand the
  // whole email — CTA and all — to the body.
  for (const label of Object.values(NEWSLETTER_SUBJECT_LABELS)) {
    const { subject, body } = splitNewsletter(`${label}: Sleep guide\n\nFirst paragraph.`);
    assert.equal(subject, "Sleep guide", `${label} prefix was not peeled`);
    assert.equal(body, "First paragraph.");
  }
});

test("an en newsletter variant round-trips generate → split → export", () => {
  const [newsletter] = repurpose(
    { title: "How to store nuts", url: "https://blog.example.cz/nuts", body: "Air, heat and light turn nuts rancid." },
    "en"
  );
  const { subject, body } = splitNewsletter(newsletter.text);
  assert.equal(subject, "How to store nuts");
  assert.ok(body.length > 0, "en body must survive the split");
  assert.equal(checkSubject(subject).status, "ok");
  const out = newsletterPlainText({ subject, body, ctaUrl: newsletter.link, locale: "en" });
  assert.ok(out.startsWith("Subject: How to store nuts\n"));
  assert.ok(!out.includes("Předmět"));
});
