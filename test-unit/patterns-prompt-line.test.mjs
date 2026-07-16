/** Direction 1 — patterns travel with their proof. The PROMPT-line formatter carries
 *  a compact evidence clause when a pattern has proof, and drops it cleanly when it
 *  does not (pinned line format, w/ and w/o evidence). Plus the end-to-end join: a
 *  live LP-experiment winner (project-scoped, threaded by projectId) mines a pattern
 *  whose prompt line carries its own evidence — the proof reaches the grounded prompt.
 *  Pattern lines are dynamic USER-prompt content, so no golden fingerprint moves. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-patterns-prompt-line-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { compactEvidence, patternPromptLine, extractExperimentPatterns } = await import(
  "@/lib/patterns/extract"
);
const { createExperiment, clearExperiments } = await import("@/lib/lp-exp/store");

const mk = (over = {}) => ({
  id: "x",
  title: "Vzor pro škálování",
  category: "budget",
  insight: "Škálujte tento střih výš.",
  evidence: "ROAS 7,0×, PNO 14 % (cíl 18 %).",
  source: "manual",
  createdAt: "",
  ...over,
});

test("patternPromptLine: carries a compact evidence clause when proof exists", () => {
  assert.equal(
    patternPromptLine(mk()),
    "- Vzor pro škálování: Škálujte tento střih výš. (doloženo: ROAS 7,0×, PNO 14 % (cíl 18 %).)"
  );
});

test("patternPromptLine: insight-only line when the pattern has no evidence", () => {
  assert.equal(patternPromptLine(mk({ evidence: "" })), "- Vzor pro škálování: Škálujte tento střih výš.");
  assert.equal(
    patternPromptLine(mk({ evidence: "   " })),
    "- Vzor pro škálování: Škálujte tento střih výš."
  );
  assert.equal(patternPromptLine(mk({ evidence: undefined })), "- Vzor pro škálování: Škálujte tento střih výš.");
});

test("compactEvidence: collapses whitespace and elides past the cap", () => {
  assert.equal(compactEvidence("  ROAS\n7,0×   při   nákladech  "), "ROAS 7,0× při nákladech");
  assert.equal(compactEvidence(""), "");
  assert.equal(compactEvidence(undefined), "");
  const long = "A".repeat(300);
  const out = compactEvidence(long);
  assert.ok(out.length <= 140, "capped to the clause max");
  assert.ok(out.endsWith("…"), "elided with an ellipsis");
});

test("proof travels: a live experiment winner's prompt line carries its own evidence", async () => {
  const pid = "proj-proof-travels";
  await clearExperiments(pid);
  await createExperiment(pid, {
    cluster: "e-mailový marketing nástroj",
    status: "done",
    variants: [
      { label: "A · Kontrola", visitors: 4200, signups: 176 },
      { label: "B · Zdarma navždy", visitors: 4180, signups: 231 },
    ],
  });
  const mined = await extractExperimentPatterns(pid);
  assert.equal(mined.length, 1, "one significant winner → one creative pattern");
  const line = patternPromptLine(mined[0]);
  assert.match(line, /^- .+: .+ \(doloženo: .+\)$/, "line format with evidence clause");
  assert.ok(line.includes(mined[0].evidence.slice(0, 20)), "the experiment's own proof rides the line");
  await clearExperiments(pid);
});
