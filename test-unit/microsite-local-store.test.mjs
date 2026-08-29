/** The microsite REGISTRY's local twin (table `microsites`, migration v23): the
 *  Firestore-only tail of the /m/{slug} seam closes, so a `dev:local` tenant can
 *  actually publish a microsite offline instead of hard-500ing. Runs the REAL public
 *  API (`enableMicrosite` / `getMicrosite` / `getMicrositeForTenant` /
 *  `disableMicrosite`) against the sqlite backend, and asserts the row really lands
 *  in the table — a store that silently degraded to the built-in demo would pass a
 *  weaker test.
 *
 *  Also pins the two behaviours the sqlite backend had to be written FOR, not just
 *  around (see store.local.ts): the merge-on-upsert that keeps an omitted logoUrl
 *  alive across a re-publish (Firestore's `set(…, {merge:true})` does this for free),
 *  and the `kind` default-on-read that makes a pre-`kind` document readable.
 *
 *  The ownership rules (ADR-0002) are POLICY and live in microsite.ts, not in the
 *  store — asserted here end-to-end so "the store must not bypass ownership" is a
 *  test, not a comment. Sibling suites: microsite-view.test.mjs (the view resolver on
 *  sqlite), microsite-view-firestore.test.mjs (the same on Firestore). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-microsite-store-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
// microsite.ts reaches the article/dataset spine (→ @/data/performance.json).
register("./json-loader.mjs", import.meta.url);

const { getMicrosite, getMicrositeForTenant, enableMicrosite, disableMicrosite, DEMO_MICROSITE, MicrositeSlugError } =
  await import("@/lib/microsite");
const store = await import("@/lib/microsite/store");
const { getDb } = await import("@/lib/db");

const T_A = "u_alice_proj_p1";
const T_B = "u_bob_proj_p2";

/** The raw sqlite row, so "it went to the local table" is proven, not assumed. */
function rawRow(slug) {
  return getDb().prepare("SELECT slug, tenant, data, updated_at FROM microsites WHERE slug = ?").get(slug);
}

test("publish → the config lands in the sqlite `microsites` table and reads back by slug and by tenant", async () => {
  const cfg = await enableMicrosite(T_A, {
    slug: "acme",
    clientName: "Acme s.r.o.",
    segment: "E-shop · nářadí",
    brandName: "Acme",
    accentColor: "#123456",
    logoUrl: "https://cdn.example/acme.png",
    periodDays: 90,
    projectId: "p1",
  });
  assert.equal(cfg.slug, "acme");
  assert.equal(cfg.tenant, T_A);
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.periodDays, 90);
  assert.equal(cfg.kind, "performance"); // written on every upsert

  // It really is a local row, keyed by slug with the tenant columned for the index.
  const row = rawRow("acme");
  assert.ok(row, "a `microsites` row should exist");
  assert.equal(row.tenant, T_A);
  assert.deepEqual(JSON.parse(row.data), cfg);

  assert.deepEqual(await getMicrosite("acme"), cfg);
  assert.deepEqual(await getMicrositeForTenant(T_A), cfg);
  assert.equal(await getMicrositeForTenant(T_B), null);
});

test("re-publish MERGES: an omitted optional field survives (matches Firestore's merge set)", async () => {
  const before = await getMicrosite("acme");
  assert.equal(before.logoUrl, "https://cdn.example/acme.png");

  // A minimal re-publish carries neither logoUrl nor projectId nor periodDays.
  const after = await enableMicrosite(T_A, { slug: "acme", clientName: "Acme s.r.o." });
  assert.equal(after.logoUrl, undefined); // the returned config is what was written…
  assert.equal(after.periodDays, 30); // …periodDays really did fall back

  // …but the STORED config keeps the branding the tenant published earlier, exactly
  // as Firestore's `set(cfg, { merge: true })` would. A blob replace would drop it.
  const stored = await getMicrosite("acme");
  assert.equal(stored.logoUrl, "https://cdn.example/acme.png");
  assert.equal(stored.projectId, "p1");
  assert.equal(stored.periodDays, 30); // the re-published value DID win
});

test("slug ownership is pinned to the tenant — another tenant cannot take the URL", async () => {
  await assert.rejects(
    () => enableMicrosite(T_B, { slug: "acme", clientName: "Evil Corp" }),
    (err) => {
      assert.ok(err instanceof MicrositeSlugError);
      assert.equal(err.code, "slug-taken");
      return true;
    }
  );
  // The registry is untouched: the row still belongs to the original tenant.
  assert.equal(rawRow("acme").tenant, T_A);
  assert.equal((await getMicrosite("acme")).clientName, "Acme s.r.o.");
});

test("a DISABLED foreign site still pins the slug (the case getMicrosite alone cannot see)", async () => {
  await enableMicrosite(T_B, { slug: "beta", clientName: "Beta" });
  await disableMicrosite(T_B);
  assert.equal(await getMicrosite("beta"), null); // invisible to the public read…
  await assert.rejects(
    () => enableMicrosite(T_A, { slug: "beta", clientName: "Beta Squat" }),
    /belongs to another tenant/
  );
  assert.equal(rawRow("beta").tenant, T_B); // …and still owned
});

test("the built-in demo slug is reserved for its own tenant", async () => {
  await assert.rejects(
    () => enableMicrosite(T_A, { slug: DEMO_MICROSITE.slug, clientName: "Squatter" }),
    (err) => err instanceof MicrositeSlugError && err.code === "slug-taken"
  );
  assert.equal(rawRow(DEMO_MICROSITE.slug), undefined); // nothing was written
  // The demo still resolves with no stored row at all (offline-first fallback).
  assert.deepEqual(await getMicrosite(DEMO_MICROSITE.slug), DEMO_MICROSITE);
});

test("a malformed slug is refused before any write", async () => {
  await assert.rejects(
    () => enableMicrosite(T_A, { slug: "Not A Slug!", clientName: "X" }),
    (err) => err instanceof MicrositeSlugError && err.code === "invalid-slug"
  );
  assert.equal(rawRow("Not A Slug!"), undefined);
});

test("a kind with no renderer is refused (invalid-kind), so no blank page reaches a public URL", async () => {
  for (const kind of ["local-landing", "lp"]) {
    await assert.rejects(
      () => enableMicrosite(T_A, { slug: "gamma", clientName: "Gamma", kind }),
      (err) => err instanceof MicrositeSlugError && err.code === "invalid-kind"
    );
  }
  assert.equal(rawRow("gamma"), undefined);
  // …while the publishable kind goes through, explicitly or by default.
  assert.equal((await enableMicrosite(T_A, { slug: "gamma", clientName: "Gamma", kind: "performance" })).kind, "performance");
});

test("disable → the public read goes dark, the management read keeps the config for re-enabling", async () => {
  await enableMicrosite(T_A, { slug: "acme", clientName: "Acme s.r.o." });
  const publishedAt = (await getMicrosite("acme")).updatedAt;

  await disableMicrosite(T_A);

  // T_A owns two slugs by now; getByTenant caps at one with an explicit slug order
  // (ADR-0001's capped-read rule), so "acme" is the deterministic answer.
  const offline = await getMicrositeForTenant(T_A);
  assert.equal(offline.slug, "acme");
  assert.equal(offline.enabled, false);
  assert.equal(await getMicrosite("acme"), null);

  // Only `enabled` moved: identity and the published updatedAt are untouched.
  assert.equal(offline.clientName, "Acme s.r.o.");
  assert.equal(offline.updatedAt, publishedAt);

  // Re-enabling restores the same slug for the same tenant.
  const back = await enableMicrosite(T_A, { slug: "acme", clientName: "Acme s.r.o." });
  assert.equal(back.enabled, true);
  assert.equal((await getMicrosite("acme")).enabled, true);
});

test("a pre-`kind` document reads back as `performance` (the default-on-read, one place)", async () => {
  // Write a legacy-shaped row straight past the public API — this is exactly what a
  // registry populated before the field looks like.
  getDb()
    .prepare("INSERT INTO microsites (slug, tenant, data, updated_at) VALUES (?, ?, ?, ?)")
    .run(
      "legacy",
      T_B,
      JSON.stringify({
        slug: "legacy",
        tenant: T_B,
        clientName: "Legacy",
        segment: "",
        brandName: "Legacy",
        accentColor: "#0f766e",
        periodDays: 30,
        enabled: true,
        illustrative: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      "2026-01-01T00:00:00.000Z"
    );
  assert.equal(JSON.parse(rawRow("legacy").data).kind, undefined); // absent on the wire
  assert.equal((await getMicrosite("legacy")).kind, "performance"); // present to callers
  assert.equal((await store.getBySlug("legacy")).kind, "performance");
});

test("the store is policy-free: getBySlug surfaces disabled configs and does NOT swallow errors", async () => {
  // Disabled configs round-trip through the raw store (this is what the ownership
  // check in enableMicrosite reads), unlike the public getMicrosite.
  const beta = await store.getBySlug("beta");
  assert.equal(beta.enabled, false);
  assert.equal(beta.tenant, T_B);
  // A free slug is null, not the demo — the demo fallback is microsite.ts's policy.
  assert.equal(await store.getBySlug("mionelo"), null);
  assert.equal(await store.getByTenant("u_nobody_proj_x"), null);
});
