/** The deterministic first reply (`lib/speed-lead/draft.ts`) greets a PERSON.
 *
 *  Its callers hand it whatever identifies the lead: a live CRM row falls back from
 *  the person's name to the company, the e-mail, the phone or nothing, and the
 *  twin-reply fallback used a filler word ("zákazník") when the outbox had no
 *  recipient. Each of those became the greeting ("Dobrý den, jana@firma.cz,",
 *  "Dobrý den, ,", "Dobrý den, zákazník,"). The greeting now uses a first name only
 *  when one was given and reads as a name; otherwise it is the bare "Dobrý den,".
 *
 *  Floor pinned beside it: the contact-back promise still follows the arrival
 *  channel, no reply names a number of minutes, and the questions are unchanged. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

// The model is mocked to return an empty reply, so the tool's real normalize falls
// back to the deterministic floor. Pure: no network, no telemetry.
mock.module("@/lib/llm", {
  namedExports: {
    generateStructured: async (args) => ({ ok: true, data: { result: args.normalize({ reply: "" }) } }),
  },
});

const { draftReply } = await import("@/lib/speed-lead/draft");
const { contactToInboundLead } = await import("@/lib/speed-lead/inbox-source");
const { generateTwinReply } = await import("@/lib/ai/tools/twin-reply");

const lead = (name, channel = "form") => ({ id: "x", name, channel, message: "Poptávka", minutesAgo: 0 });
const greeting = (reply) => reply.split("\n")[0];

const NOW = Date.parse("2026-10-22T10:00:00Z");
const contact = (extra) => ({
  id: "c1",
  stage: "new",
  firstSeenAt: "2026-10-22T09:55:00Z",
  ...extra,
});

test("a given first name is the greeting", () => {
  assert.equal(greeting(draftReply(lead("Jana Nováková")).reply), "Dobrý den, Jana,");
  assert.equal(greeting(draftReply(lead("Anne-Marie O'Neil")).reply), "Dobrý den, Anne-Marie,");
});

test("no name, or an identifier in the name field, greets neutrally", () => {
  for (const name of ["", "   ", "jana.novakova@firma.cz", "+420 777 123 456", "777123456"]) {
    assert.equal(greeting(draftReply(lead(name)).reply), "Dobrý den,", `name ${JSON.stringify(name)}`);
  }
});

test("a live CRM row greets the person, never the company, e-mail or phone it is labelled with", () => {
  const rows = [
    contact({ companyName: "Elektro Novák s.r.o." }),
    contact({ email: "info@elektro-novak.cz" }),
    contact({ phone: "+420 777 123 456" }),
    contact({}),
  ];
  for (const c of rows) {
    const row = contactToInboundLead(c, NOW);
    assert.equal(greeting(draftReply(row).reply), "Dobrý den,", JSON.stringify(c));
  }
  const named = contactToInboundLead(contact({ name: "Petr Svoboda", companyName: "Elektro Novák s.r.o." }), NOW);
  assert.equal(greeting(draftReply(named).reply), "Dobrý den, Petr,");
  // the inbox label keeps its fallback chain: the row still shows who it is
  assert.equal(contactToInboundLead(rows[0], NOW).name, "Elektro Novák s.r.o.");
});

test("the twin-reply floor greets neutrally when the outbox has no recipient", async () => {
  const res = await generateTwinReply({ inbound: "Dobrý den, kolik stojí revize?", channel: "leads", projectType: "revize" });
  const reply = res.data?.result?.reply ?? "";
  assert.ok(reply.length > 0, "keyless call returns the deterministic floor");
  assert.equal(greeting(reply), "Dobrý den,");
  const named = await generateTwinReply({ inbound: "Dobrý den", channel: "leads", projectType: "revize", contact: "Eva Dvořáková" });
  assert.equal(greeting(named.data.result.reply), "Dobrý den, Eva,");
});

test("floor: the promise follows the channel, never a number of minutes", () => {
  const expected = {
    call: "ozveme se Vám zpět telefonicky co nejdříve",
    form: "ozveme se Vám na uvedený kontakt co nejdříve",
    chat: "odpovíme Vám zde co nejdříve",
    email: "odpovíme Vám na e-mail co nejdříve",
  };
  for (const [channel, sentence] of Object.entries(expected)) {
    for (const name of ["Jana Nováková", ""]) {
      const d = draftReply(lead(name, channel));
      assert.ok(d.reply.includes(sentence), `${channel}: ${d.reply}`);
      assert.doesNotMatch(d.reply, /\d+\s*min/);
      assert.equal(d.questions.length, 3);
    }
  }
});
