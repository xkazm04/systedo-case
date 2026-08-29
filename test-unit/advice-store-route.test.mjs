/** WP W3-A — the three SERVER seams around the pure ledger:
 *
 *   • `src/lib/advice/store.ts`   — the project_state wrapper: sanitize-on-read, the
 *     compare-and-swap write, and the ONE narrow per-record status flip;
 *   • `src/lib/advice/record.ts`  — the render hook: demo-skipped, anonymous-skipped,
 *     and incapable of throwing at a page render;
 *   • `src/app/api/projects/[id]/advice/route.ts` — GET + PATCH, with `resolved`
 *     refused as a client-settable status.
 *
 *  `@/lib/project-state/store` is mocked with an in-memory backend that models the
 *  real CAS contract (a write whose `expected` revision has moved throws
 *  ProjectStateConflictError), so the retry path is exercised without sqlite or
 *  Firestore — and without this suite joining the `@/lib/db` import chain. The
 *  ownership guard is mocked the way catalog-events-routes.test.mjs mocks it.
 *  Run with --experimental-test-module-mocks. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const UID = "u1";
const PID = "p1";
const DEMO = "demo-eshop";

// --- the fake project_state backend ----------------------------------------

const blobs = new Map(); // "uid|pid|key" -> { data, revision }
let revisionSeq = 0;
/** Set to a function to hijack ONE mutate attempt (used to force a CAS conflict). */
let raceOnce = null;
const reads = [];
const writes = [];

class ProjectStateConflictError extends Error {
  constructor(key) {
    super(`conflict on ${key}`);
    this.name = "ProjectStateConflictError";
    this.retryable = true;
    this.key = key;
  }
}

const cell = (uid, pid, key = "adviceLedger") => `${uid}|${pid}|${key}`;

mock.module("@/lib/project-state/store", {
  namedExports: {
    ProjectStateConflictError,
    getProjectState: async (uid, pid, key) => {
      reads.push(cell(uid, pid, key));
      return blobs.get(cell(uid, pid, key))?.data ?? null;
    },
    /** Models mutateProjectState: read → mutate → CAS write, retrying on conflict. */
    mutateProjectState: async (uid, pid, key, mutate, attempts = 8) => {
      const id = cell(uid, pid, key);
      for (let i = 0; i < attempts; i++) {
        const current = blobs.get(id) ?? { data: null, revision: null };
        const next = mutate(current.data);
        if (raceOnce) {
          // Another writer lands between this read and this write.
          const interloper = raceOnce;
          raceOnce = null;
          interloper();
        }
        const now = blobs.get(id) ?? { data: null, revision: null };
        if (now.revision !== current.revision) continue; // lost the race → re-apply
        blobs.set(id, { data: next, revision: ++revisionSeq });
        writes.push(id);
        return next;
      }
      throw new ProjectStateConflictError(key);
    },
  },
});

mock.module("@/lib/projects/api-guard", {
  namedExports: {
    requireOwnedProject: async () => ({
      uid: UID,
      project: { id: PID, name: "T", type: "eshop", accentColor: "#fff", createdAt: "x", updatedAt: "x" },
    }),
  },
});

let sessionUid = UID;
mock.module("@/lib/session", {
  namedExports: {
    currentUserId: async () => sessionUid,
    currentSession: async () => null,
  },
});

const { getAdviceLedger, mutateAdviceLedger, setAdviceSubjectStatus } = await import("@/lib/advice/store");
const { recordAdviceSighting, sightingOf } = await import("@/lib/advice/record");
const { updateAdviceLedger } = await import("@/lib/advice/ledger");
const { GET, PATCH } = await import("@/app/api/projects/[id]/advice/route.ts");

const NOW = new Date("2026-08-10T08:00:00.000Z");
const params = Promise.resolve({ id: PID });
const patch = (body) =>
  new Request("https://x/api/projects/p1/advice", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const rec = (subjectKey, over = {}) => ({
  id: `zisk:${subjectKey}`,
  subjectKey,
  module: "zisk",
  moduleLabel: "Zisk",
  severity: "critical",
  title: `Rada ${subjectKey}`,
  detail: "d",
  ...over,
});

// --- store ------------------------------------------------------------------

test("an unseeded project reads as null, never as a throw", async () => {
  assert.equal(await getAdviceLedger(UID, "never-seen"), null);
});

test("the write rides project_state and the read sanitizes what comes back", async () => {
  await mutateAdviceLedger(UID, PID, (current) =>
    updateAdviceLedger(current, [{ subjectKey: "a", module: "zisk", severity: "warning", title: "A" }], NOW)
  );
  assert.ok(writes.includes(cell(UID, PID, "adviceLedger")), "written under the registered key");
  const ledger = await getAdviceLedger(UID, PID);
  assert.equal(ledger.records.length, 1);
  assert.equal(ledger.records[0].subjectKey, "a");
  assert.equal(ledger.updatedAt, NOW.toISOString());
});

test("a corrupt stored blob degrades to 'nothing tracked', not to a crash", async () => {
  blobs.set(cell(UID, "corrupt"), { data: { records: "not an array" }, revision: ++revisionSeq });
  assert.equal(await getAdviceLedger(UID, "corrupt"), null);
});

test("CAS: a concurrent write is re-applied, not clobbered", async () => {
  const key = "race-project";
  // Writer B lands while writer A is mid-mutation; A must re-read and keep B's record.
  raceOnce = () => {
    blobs.set(cell(UID, key), {
      data: updateAdviceLedger(null, [{ subjectKey: "from-b", module: "m", severity: "info", title: "B" }], NOW),
      revision: ++revisionSeq,
    });
  };
  await mutateAdviceLedger(UID, key, (current) =>
    updateAdviceLedger(current, [{ subjectKey: "from-a", module: "m", severity: "info", title: "A" }], NOW)
  );
  const ledger = await getAdviceLedger(UID, key);
  assert.deepEqual(
    ledger.records.map((r) => r.subjectKey).sort(),
    ["from-a", "from-b"],
    "both writers survive — this is the whole point of the CAS"
  );
});

test("setAdviceSubjectStatus flips ONE record and returns it; an unknown subject returns null", async () => {
  const dismissed = await setAdviceSubjectStatus(UID, PID, "a", "dismissed", NOW);
  assert.equal(dismissed.status, "dismissed");
  assert.equal(dismissed.dismissedAt, NOW.toISOString());
  assert.equal(await setAdviceSubjectStatus(UID, PID, "nope", "dismissed", NOW), null);
  const back = await setAdviceSubjectStatus(UID, PID, "a", "open", NOW);
  assert.equal(back.status, "open");
  assert.equal(back.dismissedAt, undefined);
});

test("un-dismissing clears any machine-minted resolve — the client cannot mint a verdict", async () => {
  const key = "undismiss";
  await mutateAdviceLedger(UID, key, () => ({
    updatedAt: NOW.toISOString(),
    records: [
      {
        subjectKey: "z",
        module: "m",
        severity: "info",
        title: "Z",
        firstSeenAt: NOW.toISOString(),
        lastSeenAt: NOW.toISOString(),
        timesSeen: 2,
        reopenedCount: 0,
        status: "dismissed",
        dismissedAt: NOW.toISOString(),
        resolvedAt: NOW.toISOString(),
        snapshot: { key: "poas", firstValue: 1, lastValue: 2 },
        outcome: { status: "improved", deltaPct: 1, at: NOW.toISOString() },
      },
    ],
  }));
  const back = await setAdviceSubjectStatus(UID, key, "z", "open", NOW);
  assert.equal(back.status, "open");
  assert.equal(back.resolvedAt, undefined);
  assert.equal(back.outcome, undefined);
});

// --- record.ts (the render hook) -------------------------------------------

test("sightingOf carries identity + snapshot and drops the localized body text", () => {
  const s = sightingOf(rec("k", { metric: "3×", detail: "long czech sentence", impactCzk: 500, sample: true, snapshot: { key: "poas", value: 2 } }));
  assert.deepEqual(s, {
    subjectKey: "k",
    module: "zisk",
    severity: "critical",
    title: "Rada k",
    impactCzk: 500,
    sample: true,
    snapshot: { key: "poas", value: 2 },
  });
  assert.equal(s.detail, undefined, "the blob must not become a copy of the UI");
  assert.equal(s.moduleLabel, undefined);
});

test("the render hook records a real project's sighting", async () => {
  const before = writes.length;
  assert.equal(await recordAdviceSighting("hooked", [rec("a"), rec("b")], NOW), true);
  assert.ok(writes.length > before);
  assert.equal((await getAdviceLedger(UID, "hooked")).records.length, 2);
});

test("a DEMO project id is skipped at the seam — no read, no write", async () => {
  const before = [reads.length, writes.length];
  assert.equal(await recordAdviceSighting(DEMO, [rec("a")], NOW), false);
  assert.deepEqual([reads.length, writes.length], before, "the demo path stays I/O-free");
});

test("an anonymous viewer and an empty rec list are both no-ops", async () => {
  sessionUid = null;
  assert.equal(await recordAdviceSighting("anon", [rec("a")], NOW), false);
  sessionUid = UID;
  assert.equal(await recordAdviceSighting("empty", [], NOW), false);
  assert.equal(await recordAdviceSighting("", [rec("a")], NOW), false);
});

test("the hook SWALLOWS a store failure — it can never fail a page render", async () => {
  const key = "explode";
  // Force every CAS attempt to lose, which is how mutateProjectState gives up.
  raceOnce = null;
  const original = blobs.get.bind(blobs);
  blobs.get = () => {
    throw new Error("store on fire");
  };
  try {
    assert.equal(await recordAdviceSighting(key, [rec("a")], NOW), false);
  } finally {
    blobs.get = original;
  }
});

// --- route ------------------------------------------------------------------

test("GET returns the ledger, and an empty one for a project with no history", async () => {
  const res = await GET(new Request("https://x/api/projects/p1/advice"), { params });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.ledger.records));
  assert.ok(body.ledger.records.some((r) => r.subjectKey === "a"));
});

test("PATCH dismisses a subject and PATCH open restores it", async () => {
  const off = await PATCH(patch({ subjectKey: "a", status: "dismissed" }), { params });
  assert.equal(off.status, 200);
  assert.equal((await off.json()).record.status, "dismissed");

  const on = await PATCH(patch({ subjectKey: "a", status: "open" }), { params });
  assert.equal((await on.json()).record.status, "open");
});

test("PATCH refuses `resolved` with a 422 — that status is machine-minted only", async () => {
  const res = await PATCH(patch({ subjectKey: "a", status: "resolved" }), { params });
  assert.equal(res.status, 422, "a client-set 'resolved' would be a verdict with no measurement");
});

test("PATCH 422s a missing subjectKey or an unknown status, and 404s an unknown subject", async () => {
  assert.equal((await PATCH(patch({ status: "dismissed" }), { params })).status, 422);
  assert.equal((await PATCH(patch({ subjectKey: "a", status: "nope" }), { params })).status, 422);
  assert.equal((await PATCH(patch({ subjectKey: "a" }), { params })).status, 422);
  const missing = await PATCH(patch({ subjectKey: "never-tracked", status: "dismissed" }), { params });
  assert.equal(missing.status, 404);
});

test("a dismissed subject is what the render filter reads back", async () => {
  await PATCH(patch({ subjectKey: "a", status: "dismissed" }), { params });
  const { dismissedSubjectKeys } = await import("@/lib/advice/ledger");
  assert.deepEqual([...dismissedSubjectKeys(await getAdviceLedger(UID, PID))], ["a"]);
});
