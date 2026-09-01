/** ONE contract, executed against BOTH drivers of the ADR-0001 seam.
 *
 *  THE GAP THIS CLOSES. The seam has two implementations and, until this file, two
 *  SUITES: `test-unit/project-state-concurrency.test.mjs` proves the sqlite driver,
 *  `test-unit/distribution-variants-firestore.test.mjs` proves the Firestore one,
 *  `test-unit/activity-store-local.test.mjs` and
 *  `test-unit/activity-store-firestore.test.mjs` do the same for the feed. Each is
 *  well written and each proves ITS driver. What none of them proves is the SEAM:
 *  the two files are hand-written prose about the same promise, so they can agree
 *  today and drift tomorrow — a case added on one side and forgotten on the other
 *  looks exactly like a case that was never worth writing, and a behaviour that
 *  holds only on the driver the offline lane runs is the divergence ADR-0001's
 *  "Revisit when" is watching for.
 *
 *  So the cases live HERE, once, written against an interface rather than a
 *  backend, and each runner file executes the whole list against both drivers in
 *  one process. Adding a case adds it to both drivers by construction, which is the
 *  only property this file has that two parallel suites cannot.
 *
 *  AND THE ANSWERS ARE COMPARED. Every case returns an OBSERVATION — a small
 *  JSON-shaped value it asserted its way to — and a final test deep-compares the
 *  observations across drivers. That is the half a per-driver assertion cannot
 *  reach: `assert.equal(lost, false)` passing on both sides says each driver
 *  satisfies the sentence, while comparing the observations says they satisfy it
 *  the SAME WAY. An observation therefore never carries a backend's own vocabulary
 *  — sqlite mints a uuid where the Firestore fake mints `doc-3`, and both are
 *  correct — only what a caller of the seam is allowed to depend on.
 *
 *  WHAT THIS CANNOT SEE, stated rather than left to be assumed. The Firestore side
 *  runs against the in-memory fakes in `test-unit/firestore-fake.mjs` and
 *  `test-unit/activity-firestore-fake.mjs`, not against Firestore. The fakes model
 *  the guarantees the drivers lean on (a serialized transaction, `>=` + `orderBy` +
 *  `limit`); they cannot model the service's own tie-break, so the one hazard
 *  ADR-0001 rule 3 names — a CAPPED read whose sort key ties, where Firestore falls
 *  back to `__name__` and sqlite to `rowid` — is deliberately not asserted here. The
 *  tie case below asserts MEMBERSHIP on an uncapped read, which is true on any
 *  engine, and says so where it does it.
 *
 *  Pure: no app imports, no filesystem, no environment. The runner files supply the
 *  drivers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// The blob store: src/lib/project-state/store.{local,firestore}.ts
// ---------------------------------------------------------------------------

const U = "u-contract";
const P = "p-contract";
const K = "reviews";

/** The invariants ADR-0001 says both project-state backends owe a caller, in the
 *  vocabulary of the raw driver interface the dispatcher sits on:
 *
 *    read(user, project, key)                        → the stored bytes or null
 *    write(user, project, key, raw, expected)        → did this write land?
 *        expected === undefined → unconditional (last write wins)
 *        expected === null      → only if nothing is stored
 *        expected === string    → only if the stored bytes are exactly that
 *    remove(user, project)                           → drop every key of the pair
 */
export const BLOB_STORE_CONTRACT = [
  {
    name: "a key that was never written reads back null",
    async run(s) {
      const before = await s.read(U, P, K);
      assert.equal(before, null, "an absent blob is null, never a thrown 'not found'");
      return { before };
    },
  },
  {
    name: "an unconditional write always lands, and the later one wins",
    async run(s) {
      const first = await s.write(U, P, K, "alpha", undefined);
      const afterFirst = await s.read(U, P, K);
      const second = await s.write(U, P, K, "beta", undefined);
      const afterSecond = await s.read(U, P, K);
      assert.equal(first, true);
      assert.equal(second, true);
      assert.equal(afterFirst, "alpha");
      assert.equal(afterSecond, "beta", "expected === undefined is documented last-write-wins");
      return { first, second, afterFirst, afterSecond };
    },
  },
  {
    name: "the bytes come back exactly as they went in",
    async run(s) {
      // The revision token IS the stored bytes, so a driver that normalises them —
      // a trimmed string, a re-serialised JSON field, a lost combining accent —
      // breaks compare-and-swap for every caller without failing anything else.
      const raw = JSON.stringify({
        t: 'Přesun "rozpočtu" — 10 %',
        multiline: "řádek 1\nřádek 2\ttab",
        n: -0.5,
        deep: { a: [1, null, "ž"] },
      });
      await s.write(U, P, K, raw, undefined);
      const back = await s.read(U, P, K);
      assert.equal(back, raw, "the stored blob is bytes, not a value the driver may re-encode");
      return { roundTripped: back === raw, length: raw.length };
    },
  },
  {
    name: "a create-only write wins on an empty key and loses on a taken one",
    async run(s) {
      const won = await s.write(U, P, K, "first", null);
      const lost = await s.write(U, P, K, "second", null);
      const stored = await s.read(U, P, K);
      assert.equal(won, true);
      assert.equal(lost, false, "expected === null means 'only if nothing is stored'");
      assert.equal(stored, "first", "the loser did not overwrite the winner");
      return { won, lost, stored };
    },
  },
  {
    name: "a compare-and-swap against stale bytes loses without clobbering the winner",
    async run(s) {
      await s.write(U, P, K, "v1", undefined);
      await s.write(U, P, K, "v2", undefined); // someone else got there first
      const lost = await s.write(U, P, K, "mine", "v1");
      const afterLoss = await s.read(U, P, K);
      const won = await s.write(U, P, K, "mine", "v2");
      const afterWin = await s.read(U, P, K);
      assert.equal(lost, false);
      assert.equal(afterLoss, "v2", "the winner's blob survived the losing write");
      assert.equal(won, true, "the same write lands against the CURRENT bytes");
      assert.equal(afterWin, "mine");
      return { lost, afterLoss, won, afterWin };
    },
  },
  {
    name: "losing is reported as false — never as an engine's error shape",
    async run(s) {
      // ADR-0001 rule 2: a declarative constraint FAILS a duplicate write and a
      // derived key lets it succeed harmlessly, so the outcome vocabulary is written
      // for the invariant. A SQLITE_CONSTRAINT or a Firestore `code` reaching a
      // caller has moved the invariant's interpretation into every call site.
      await s.write(U, P, K, "v1", undefined);
      const staleLoss = await s.write(U, P, K, "x", "bytes-that-were-never-stored");
      const absentLoss = await s.write(U, P, "adCopy", "x", "expecting-something-here");
      assert.equal(typeof staleLoss, "boolean", "a lost race is a boolean, not a throw");
      assert.equal(typeof absentLoss, "boolean");
      assert.equal(staleLoss, false);
      assert.equal(absentLoss, false, "a CAS against a blob that is not there loses; it does not create");
      assert.equal(await s.read(U, P, "adCopy"), null);
      return { staleLoss, absentLoss };
    },
  },
  {
    name: "concurrent create-only writers: exactly one lands",
    async run(s) {
      const values = ["a", "b", "c", "d", "e"];
      const results = await Promise.all(values.map((v) => s.write(U, P, K, v, null)));
      const winners = results.filter(Boolean).length;
      const stored = await s.read(U, P, K);
      assert.equal(winners, 1, "an existence check and an insert that are not one operation let two writers win");
      assert.ok(values.includes(stored), "the stored blob is one writer's whole value, never a blend");
      // WHICH writer won is a scheduling detail and deliberately not compared.
      return { writers: values.length, winners, storedIsOneWritersValue: values.includes(stored) };
    },
  },
  {
    name: "concurrent compare-and-swaps on one revision: exactly one lands",
    async run(s) {
      await s.write(U, P, K, "base", undefined);
      const values = ["a", "b", "c", "d", "e"];
      const results = await Promise.all(values.map((v) => s.write(U, P, K, v, "base")));
      const winners = results.filter(Boolean).length;
      const stored = await s.read(U, P, K);
      assert.equal(winners, 1);
      assert.notEqual(stored, "base", "the one winner's write is actually stored");
      assert.ok(values.includes(stored));
      return { writers: values.length, winners, baseSurvived: stored === "base" };
    },
  },
  {
    name: "keys under one (user, project) are independent blobs",
    async run(s) {
      await s.write(U, P, "reviews", "r", undefined);
      await s.write(U, P, "adCopy", "a", undefined);
      const reviews = await s.read(U, P, "reviews");
      const adCopy = await s.read(U, P, "adCopy");
      assert.equal(reviews, "r");
      assert.equal(adCopy, "a", "a second key is a second blob, not an overwrite");
      return { reviews, adCopy };
    },
  },
  {
    name: "another user's identical (project, key) is a different blob",
    async run(s) {
      // ADR-0002: the address embeds the user, so this is not a filter that could be
      // forgotten — it is the shape of the key. Same project id, same key, other user.
      await s.write(U, P, K, "mine", undefined);
      const otherUser = await s.read("u-other", P, K);
      const otherProject = await s.read(U, "p-other", K);
      assert.equal(otherUser, null);
      assert.equal(otherProject, null);
      return { otherUser, otherProject, mine: await s.read(U, P, K) };
    },
  },
  {
    name: "removing a project drops all of its keys and nothing else",
    async run(s) {
      await s.write(U, P, "reviews", "r", undefined);
      await s.write(U, P, "adCopy", "a", undefined);
      await s.write(U, "p-keep", "reviews", "keep-project", undefined);
      await s.write("u-keep", P, "reviews", "keep-user", undefined);
      await s.remove(U, P);
      const gone = [await s.read(U, P, "reviews"), await s.read(U, P, "adCopy")];
      const keptProject = await s.read(U, "p-keep", "reviews");
      const keptUser = await s.read("u-keep", P, "reviews");
      assert.deepEqual(gone, [null, null], "the cascade takes every key of the pair, not just the one it knew about");
      assert.equal(keptProject, "keep-project", "another project of the same user is untouched");
      assert.equal(keptUser, "keep-user", "another user's same-named project is untouched");
      return { gone, keptProject, keptUser };
    },
  },
  {
    name: "removing a project that stored nothing is a no-op, not an error",
    async run(s) {
      await s.remove("u-never", "p-never");
      return { removedNothing: true, stillNull: await s.read("u-never", "p-never", K) };
    },
  },
];

// ---------------------------------------------------------------------------
// The feed store: src/lib/campaigns/activity.{local,firestore}.ts
// ---------------------------------------------------------------------------

const T = "u_user-contract_proj_p1";

/** The activity feed's half of the seam:
 *
 *    append(tenant, record)                          → void
 *    read(tenant, { limit, sinceIso })               → newest-first records
 *
 *  `at` is supplied by the dispatcher above both drivers, so the cases set it
 *  explicitly: an ordering invariant proven with a clock is a flaky test.
 */
const AT = {
  oldest: "2026-08-01T09:00:00.000Z",
  middle: "2026-08-01T10:00:00.000Z",
  newest: "2026-08-01T11:00:00.000Z",
};
const row = (title, at, extra = {}) => ({ kind: "sync", title, detail: "", at, ...extra });
const titles = (records) => records.map((r) => r.title);

export const FEED_STORE_CONTRACT = [
  {
    name: "a tenant with no history reads back empty",
    async run(s) {
      const records = await s.read(T, { limit: 50 });
      assert.deepEqual(records, [], "an empty feed is emptiness; the outage contract lives in the dispatcher");
      return { count: records.length };
    },
  },
  {
    name: "an appended record reads back with its fields and a backend-assigned id",
    async run(s) {
      await s.append(
        T,
        row("Přesun rozpočtu", AT.newest, {
          kind: "budget_shift",
          detail: "Search · Brand +10 %",
          actor: "Vy",
          module: "kampane",
          severity: "info",
          publishKind: "social_post",
          publishSimulated: true,
        })
      );
      const [record] = await s.read(T, { limit: 50 });
      assert.ok(record, "the write is readable through the same driver that took it");
      assert.ok(typeof record.id === "string" && record.id.length > 0, "the backend assigns an id");
      assert.equal(record.publishSimulated, true, "a boolean survives as a boolean");
      // The id is the backend's own (a uuid here, `doc-1` there) and is deliberately
      // not compared across drivers — only its presence is a promise.
      const fields = { ...record };
      delete fields.id;
      return { hasId: record.id.length > 0, fields };
    },
  },
  {
    name: "the feed is newest-first",
    async run(s) {
      await s.append(T, row("oldest", AT.oldest));
      await s.append(T, row("newest", AT.newest));
      await s.append(T, row("middle", AT.middle));
      assert.deepEqual(titles(await s.read(T, { limit: 50 })), ["newest", "middle", "oldest"]);
      return { order: titles(await s.read(T, { limit: 50 })) };
    },
  },
  {
    name: "a capped read returns the NEWEST rows, not the first ones stored",
    async run(s) {
      // ADR-0001 rule 3: sort-then-slice is where two drivers quietly select
      // different rows. With distinct sort keys the answer is the same on any engine.
      await s.append(T, row("oldest", AT.oldest));
      await s.append(T, row("newest", AT.newest));
      await s.append(T, row("middle", AT.middle));
      const capped = titles(await s.read(T, { limit: 2 }));
      assert.deepEqual(capped, ["newest", "middle"]);
      return { capped };
    },
  },
  {
    name: "a tie changes the order, never the membership",
    async run(s) {
      // Uncapped ON PURPOSE. Which of two same-millisecond rows sorts first is the
      // engine's tie-break (rowid here, `__name__` in Firestore) and this harness
      // cannot answer it for the real service — see the header. What both drivers do
      // owe is that a tie loses no row.
      await s.append(T, row("a", AT.middle));
      await s.append(T, row("b", AT.middle));
      await s.append(T, row("c", AT.middle));
      const got = titles(await s.read(T, { limit: 50 })).sort();
      assert.deepEqual(got, ["a", "b", "c"]);
      return { members: got };
    },
  },
  {
    name: "a windowed read returns the rows at or after the boundary",
    async run(s) {
      await s.append(T, row("oldest", AT.oldest));
      await s.append(T, row("newest", AT.newest));
      await s.append(T, row("middle", AT.middle));
      const windowed = titles(await s.read(T, { limit: 50, sinceIso: AT.middle }));
      assert.deepEqual(windowed, ["newest", "middle"], "the boundary is inclusive on both drivers");
      const empty = await s.read(T, { limit: 50, sinceIso: "2027-01-01T00:00:00.000Z" });
      assert.deepEqual(empty, [], "a window with nothing in it is empty, not an error");
      return { windowed, emptyCount: empty.length };
    },
  },
  {
    name: "feeds are tenant-isolated",
    async run(s) {
      await s.append(T, row("mine", AT.newest));
      const other = await s.read(`${T}_other`, { limit: 50 });
      assert.deepEqual(other, []);
      assert.deepEqual(titles(await s.read(T, { limit: 50 })), ["mine"]);
      return { otherCount: other.length, mine: titles(await s.read(T, { limit: 50 })) };
    },
  },
];

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

/** Register `contract` once per driver, then the test that compares what the two
 *  drivers answered. `drivers` is `[{ name, store, reset }]`; `store` is whatever
 *  vocabulary the contract's cases use, and `reset` empties that driver.
 *
 *  Top-level node:test cases run in registration order, one at a time, so the
 *  comparison below runs after every observation has been taken. A driver whose
 *  case failed contributes no observation and is reported as missing rather than
 *  silently compared against nothing. */
export function runStoreContract({ contract, drivers, subject }) {
  const observations = new Map(); // case name → Map(driver name → observation)

  for (const driver of drivers) {
    for (const testCase of contract) {
      test(`[${driver.name}] ${testCase.name}`, async () => {
        await driver.reset();
        const observation = await testCase.run(driver.store);
        if (!observations.has(testCase.name)) observations.set(testCase.name, new Map());
        observations.get(testCase.name).set(driver.name, observation);
      });
    }
  }

  test(`the ${subject} drivers answered identically`, () => {
    const [first, ...rest] = drivers;
    for (const testCase of contract) {
      const taken = observations.get(testCase.name);
      assert.ok(taken, `no driver reached "${testCase.name}" — the contract was not executed.`);
      const baseline = taken.get(first.name);
      assert.ok(
        baseline !== undefined,
        `${first.name} took no observation for "${testCase.name}" (its case above failed).`
      );
      for (const driver of rest) {
        const other = taken.get(driver.name);
        assert.ok(
          other !== undefined,
          `${driver.name} took no observation for "${testCase.name}" (its case above failed).`
        );
        assert.deepEqual(
          other,
          baseline,
          `"${testCase.name}": ${driver.name} and ${first.name} both satisfied the assertions and answered ` +
            "DIFFERENTLY. One interface with two meanings is worse than two interfaces (ADR-0001) — decide which " +
            "answer the seam promises, fix the driver that does not give it, and never relax the case."
        );
      }
    }
  });
}
