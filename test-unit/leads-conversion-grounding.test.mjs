/** WP W3-C — the ONE grounding field the conversion ledger contributes to the
 *  lead-source diagnosis, and the rule it lives under: AGGREGATE COUNTS ONLY.
 *
 *  The no-field prompt is BYTE-PINNED. The ledger block is conditional, so a project
 *  without a rollup must produce exactly the prompt it produced before this WP — that
 *  is what keeps the tool's fingerprint (system + schema) and every cached diagnosis
 *  unmoved, and it is the assertion that would fail if the block ever became
 *  unconditional (which would also mean fabricating a 0 for a project that has simply
 *  never rolled up). */
import { test } from "node:test";
import assert from "node:assert/strict";

const { buildLeadSourceDiagnosisPrompt } = await import("@/lib/ai/tools/lead-source-diagnosis");
const { buildLeadSourceSeeds, seedToRequest, toLeadSourceSeed } = await import(
  "@/lib/diagnoses/lead-source-request"
);
const { withMetrics } = await import("@/lib/lead-quality/compute");
const { inputDigest } = await import("@/lib/diagnoses/types");

const REQ = {
  source: "Meta lead formuláře",
  leads: 540,
  qualified: 130,
  won: 14,
  qualRate: 0.2407,
  winRate: 0.1077,
  spend: 96000,
  cpl: 178,
  costPerQualified: 738,
};

/** The exact prompt this tool built BEFORE the conversion ledger existed. The cs
 *  number formatter emits NO-BREAK SPACEs (U+00A0) inside "24,1 %" and "96 000 Kč";
 *  they are written as escapes so the pin cannot be silently "fixed" by an editor
 *  normalising whitespace. */
const NO_FIELD_PROMPT = [
  "Níže jsou reálná, již spočítaná data jednoho zdroje leadů (kvalifikace, uzavření, náklady).",
  "Zanalyzuj, proč zdroj podvýkonný, a připrav krátkou diagnostiku.",
  "",
  "ZDROJ: Meta lead formuláře",
  "- Leadů celkem: 540",
  "- Z toho kvalifikovaných (SQL): 130 (míra kvalifikace 24,1 %)",
  "- Z toho uzavřených (won): 14 (win rate 10,8 %)",
  "- Náklady (spend): 96 000 Kč",
  "- CPL (cena za lead): 178 Kč",
  "- CPQL (cena za kvalifikovaný lead): 738 Kč",
  "",
  'Povolené hodnoty pole „likelyCause": „spam" (Spam / nekvalitní leady), „mis-targeting" (Špatné cílení (fit)), „pricing" (Cena / rozpočet), „volume" (Nízký objem dat), „ok" (Bez zásadního problému).',
  "",
  'Vrať: „summary" (krátký odstavec proč zdroj podvýkonný), „likelyCause" (jedna z povolených hodnot), „recommendation" (jedna nejúčinnější konkrétní akce) a volitelně „severity" (high | medium | low). Vycházej pouze z uvedených čísel.',
].join("\n");

test("no conversions ⇒ the prompt is BYTE-IDENTICAL to the pre-W3-C one", () => {
  assert.equal(buildLeadSourceDiagnosisPrompt(REQ), NO_FIELD_PROMPT);
});

test("with conversions ⇒ exactly ONE added line, aggregate counts + anti-fabrication", () => {
  const withField = buildLeadSourceDiagnosisPrompt({
    ...REQ,
    conversions: { qualified30d: 12, won30d: 3, gclidPct: 0.67 },
  });
  const added = withField.split("\n").filter((l) => !NO_FIELD_PROMPT.split("\n").includes(l));
  assert.equal(added.length, 1, "one line, not a section");
  assert.equal(
    added[0],
    "- Konverzní ledger za 30 dní: 12 kvalifikovaných, 3 uzavřených; 67,0 % z nich nese Google Click ID (podíl nahratelný do Google Ads, ne podíl úspěšnosti). Neodvozuj z těchto čísel nic nad rámec uvedených počtů."
  );
  // The line sits with the other per-source facts, before the allowed-values block.
  assert.ok(withField.indexOf(added[0]) < withField.indexOf("Povolené hodnoty"));
});

test("NO PII can reach the prompt: the field carries three numbers and nothing else", () => {
  const req = { ...REQ, conversions: { qualified30d: 12, won30d: 3, gclidPct: 0.67 } };
  const prompt = buildLeadSourceDiagnosisPrompt(req);
  assert.deepEqual(Object.keys(req.conversions).sort(), ["gclidPct", "qualified30d", "won30d"]);
  for (const leak of ["@", "gclid=", "GCL", "contactId"]) {
    assert.ok(!prompt.includes(leak), `"${leak}" must never reach a prompt`);
  }
});

/* ── seed → request threading ────────────────────────────────────────────────── */

const SOURCES = [
  { source: "Google Ads", leads: 300, qualified: 60, won: 4, spend: 90_000, revenue: 400_000 },
  { source: "Doporučení", leads: 40, qualified: 30, won: 12, spend: 0, revenue: 600_000 },
];
const rows = () => SOURCES.map(withMetrics).sort((a, b) => b.qualityScore - a.qualityScore);

test("the ledger join is keyed by the DISPLAY label the funnel groups by", () => {
  const conversions = { "Google Ads": { qualified30d: 9, won30d: 2, gclidPct: 0.5 } };
  const seed = toLeadSourceSeed(rows().find((r) => r.source === "Google Ads"), rows(), conversions);
  assert.deepEqual(seed.conversions, { qualified30d: 9, won30d: 2, gclidPct: 0.5 });
  assert.equal(seedToRequest(seed).conversions.qualified30d, 9);
  // an unjoined source keeps the field ABSENT — never a fabricated zero
  const other = toLeadSourceSeed(rows().find((r) => r.source === "Doporučení"), rows(), conversions);
  assert.equal(other.conversions, undefined);
  assert.equal("conversions" in seedToRequest(other), false);
});

test("no map supplied ⇒ no field ⇒ the input digest is unmoved", () => {
  const seeds = buildLeadSourceSeeds(rows());
  assert.ok(seeds.length > 0);
  for (const s of seeds) assert.equal(s.conversions, undefined);
  const bare = inputDigest(seedToRequest(seeds[0]));
  const grounded = inputDigest(
    seedToRequest(
      buildLeadSourceSeeds(rows(), { [seeds[0].source]: { qualified30d: 1, won30d: 1, gclidPct: 1 } })[0]
    )
  );
  assert.notEqual(
    bare,
    grounded,
    "the field IS part of the digest — every call site must pass the same map"
  );
});
