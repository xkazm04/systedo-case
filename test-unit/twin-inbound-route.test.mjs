/** WP W3-D — the PUBLIC twin intake route, end to end and fully offline: the Meta
 *  subscribe handshake, both signature flavours, the constant-shape refusals, and the
 *  ONE thing a valid request can do (append pending drafts to the token's OWN project).
 *
 *  It runs the REAL handlers against the REAL LOCAL_DB stores — the token trio and the
 *  twin blob — so what is pinned here is the route's behaviour, not a re-implementation
 *  of it. The only thing missing versus production is a live platform POSTing; see the
 *  WP report's "unverifiable" section.
 *
 *  ADR-0002's inversion is the headline assertion: a caller holding a valid token cannot
 *  aim it at another project, because the project is read out of the stored row and the
 *  payload's own ids are never consulted. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-twin-intake-route-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
process.env.WEBHOOK_SECRET_KEY = "test-twin-intake-route-key";

const { GET, POST } = await import("@/app/api/twin/inbound/[token]/route");
const { mintInboundToken, revokeInboundToken } = await import("@/lib/twin/inbound-store");
const { getTwin, clearTwin } = await import("@/lib/twin/store");
const { metaSignatureHeader, metaVerifyToken, INBOUND_ID_PREFIX } = await import("@/lib/twin/inbound");
const { signatureHeader } = await import("@/lib/outbound/types");

const U = "u-route";
const P = "p-route";
const OTHER = "p-route-other";

const params = (token) => ({ params: Promise.resolve({ token }) });

const META_BODY = JSON.stringify({
  object: "page",
  entry: [
    {
      id: "page_1",
      messaging: [{ sender: { id: "u_9", name: "Jana N." }, message: { mid: "m_abc", text: "Kolik to stojí?" } }],
      changes: [{ field: "feed", value: { comment_id: "c_77", from: { name: "Petr" }, message: "Skladem?" } }],
    },
  ],
});

const hubPost = (token, body, secret) =>
  POST(
    new Request(`https://app.example/api/twin/inbound/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": metaSignatureHeader(secret, body) },
      body,
    }),
    params(token)
  );

// ── GET: Meta's subscribe handshake ───────────────────────────────────────────

test("GET echoes hub.challenge only for the secret-derived verify token", async () => {
  const { row, secret } = await mintInboundToken(U, P, "social");
  const url = new URL(`https://app.example/api/twin/inbound/${row.token}`);
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.verify_token", metaVerifyToken(secret));
  url.searchParams.set("hub.challenge", "1158201444");

  const res = await GET(new Request(url), params(row.token));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "1158201444");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("GET refuses the SECRET itself in hub.verify_token (only its digest is the token)", async () => {
  const { row, secret } = await mintInboundToken(U, P, "social");
  const url = new URL(`https://app.example/api/twin/inbound/${row.token}`);
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.verify_token", secret);
  url.searchParams.set("hub.challenge", "x");
  const res = await GET(new Request(url), params(row.token));
  assert.equal(res.status, 403);
  assert.equal(await res.text(), "Unauthorized\n");
});

test("GET refuses a wrong mode, a wrong token, and an unknown address", async () => {
  const { row, secret } = await mintInboundToken(U, P, "social");
  const base = `https://app.example/api/twin/inbound/${row.token}`;
  const wrongMode = new URL(base);
  wrongMode.searchParams.set("hub.mode", "unsubscribe");
  wrongMode.searchParams.set("hub.verify_token", metaVerifyToken(secret));
  assert.equal((await GET(new Request(wrongMode), params(row.token))).status, 403);

  const wrongToken = new URL(base);
  wrongToken.searchParams.set("hub.mode", "subscribe");
  wrongToken.searchParams.set("hub.verify_token", "nope");
  assert.equal((await GET(new Request(wrongToken), params(row.token))).status, 403);

  const unknown = "0".repeat(32);
  assert.equal((await GET(new Request(`https://app.example/x`), params(unknown))).status, 404);
});

// ── POST: signatures ──────────────────────────────────────────────────────────

test("an unsigned POST is refused with the same constant shape as a bad signature", async () => {
  const { row } = await mintInboundToken(U, P, "social");
  const unsigned = await POST(
    new Request("https://app.example/x", { method: "POST", body: META_BODY }),
    params(row.token)
  );
  const badSig = await POST(
    new Request("https://app.example/x", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      body: META_BODY,
    }),
    params(row.token)
  );
  assert.equal(unsigned.status, 401);
  assert.equal(badSig.status, 401);
  assert.equal(await unsigned.text(), await badSig.text());
});

test("ACCEPTANCE — a TAMPERED body fails, and nothing reaches the twin", async () => {
  await clearTwin(P);
  const { row, secret } = await mintInboundToken(U, P, "social");
  const header = metaSignatureHeader(secret, META_BODY);
  const res = await POST(
    new Request("https://app.example/x", {
      method: "POST",
      headers: { "x-hub-signature-256": header },
      body: `${META_BODY} `,
    }),
    params(row.token)
  );
  assert.equal(res.status, 401);
  assert.equal(await getTwin(P), null, "a refused request writes nothing at all");
});

test("the Adamant flavour verifies, and a STALE timestamp is refused (replay window)", async () => {
  await clearTwin(P);
  const { row, secret } = await mintInboundToken(U, P, "email");
  const body = JSON.stringify({ from: "jana@example.cz", subject: "Poptávka", text: "Dobrý den" });

  const fresh = new Date().toISOString();
  const ok = await POST(
    new Request("https://app.example/x", {
      method: "POST",
      headers: {
        "x-adamant-timestamp": fresh,
        "x-adamant-signature": signatureHeader(secret, fresh, body),
      },
      body,
    }),
    params(row.token)
  );
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, accepted: 1, duplicates: 0 });

  const stale = new Date(Date.now() - 20 * 60_000).toISOString();
  const refused = await POST(
    new Request("https://app.example/x", {
      method: "POST",
      headers: {
        "x-adamant-timestamp": stale,
        "x-adamant-signature": signatureHeader(secret, stale, body),
      },
      body,
    }),
    params(row.token)
  );
  assert.equal(refused.status, 401, "a correctly-signed but stale request is still a replay");
});

test("an oversized body is refused before anything is parsed or stored", async () => {
  await clearTwin(P);
  const { row, secret } = await mintInboundToken(U, P, "email");
  const body = JSON.stringify({ from: "a@b.cz", text: "x".repeat(70 * 1024) });
  const res = await hubPost(row.token, body, secret);
  assert.equal(res.status, 413);
  assert.equal(await getTwin(P), null);
});

// ── POST: what a valid request actually does ──────────────────────────────────

test("ACCEPTANCE — a signed batch of 2 mints 2 pending drafts; a replay mints 0", async () => {
  await clearTwin(P);
  const { row, secret } = await mintInboundToken(U, P, "social");

  const first = await hubPost(row.token, META_BODY, secret);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ok: true, accepted: 2, duplicates: 0 });

  const twin = await getTwin(P);
  assert.equal(twin.drafts.length, 2);
  for (const d of twin.drafts) {
    assert.ok(d.id.startsWith(INBOUND_ID_PREFIX), "provenance rides the id");
    assert.equal(d.status, "pending");
    assert.equal(d.autoApproved, false);
    assert.equal(d.reply, "");
    assert.equal(d.channel, "social", "the channel comes from the ROW, not the payload");
    assert.equal("sentAt" in d, false, "the intake never mints a send stamp");
  }
  assert.deepEqual(
    twin.drafts.map((d) => d.inbound),
    ["Kolik to stojí?", "Skladem?"]
  );

  // Meta has no replay window; idempotence is what stands in for one.
  const replay = await hubPost(row.token, META_BODY, secret);
  assert.deepEqual(await replay.json(), { ok: true, accepted: 0, duplicates: 2 });
  assert.equal((await getTwin(P)).drafts.length, 2);
});

test("ACCEPTANCE — a batch with one already-stored message reports accepted:1 duplicates:1", async () => {
  const { row, secret } = await mintInboundToken(U, P, "social");
  const body = JSON.stringify({
    entry: [
      {
        messaging: [
          { sender: { id: "u_9" }, message: { mid: "m_abc", text: "Kolik to stojí?" } },
          { sender: { id: "u_1" }, message: { mid: "m_new", text: "A máte i dárkové balení?" } },
        ],
      },
    ],
  });
  const res = await hubPost(row.token, body, secret);
  assert.deepEqual(await res.json(), { ok: true, accepted: 1, duplicates: 1 });
  assert.equal((await getTwin(P)).drafts.length, 3);
});

test("ADR-0002 — the project comes from the ROW; a second project's token writes elsewhere", async () => {
  await clearTwin(OTHER);
  const before = (await getTwin(P)).drafts.length;
  const { row, secret } = await mintInboundToken(U, OTHER, "social");
  const res = await hubPost(row.token, META_BODY, secret);
  assert.equal(res.status, 200);
  assert.equal((await getTwin(OTHER)).drafts.length, 2);
  assert.equal((await getTwin(P)).drafts.length, before, "the other project's inbox is untouched");
});

test("an unparseable body is accepted:0 — never a 4xx a webhook would retry forever on", async () => {
  const { row, secret } = await mintInboundToken(U, P, "social");
  const res = await hubPost(row.token, "not json at all", secret);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, accepted: 0, duplicates: 0 });
});

test("a shape the normalizer does not know is accepted:0, not an error", async () => {
  const { row, secret } = await mintInboundToken(U, P, "social");
  const res = await hubPost(row.token, JSON.stringify({ something: "else" }), secret);
  assert.deepEqual(await res.json(), { ok: true, accepted: 0, duplicates: 0 });
});

test("a REVOKED address 404s immediately, and the refusal is not cached", async () => {
  const { row, secret } = await mintInboundToken(U, P, "chat");
  assert.equal(await revokeInboundToken(U, P, "chat"), true);
  const res = await hubPost(row.token, JSON.stringify({ from: "a@b.cz", text: "ahoj" }), secret);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("an operator's own draft is never touched by the intake", async () => {
  const { mutateTwin } = await import("@/lib/twin/store");
  await mutateTwin(P, (prev) => ({
    ...(prev ?? { voices: [], channels: [], facts: [], drafts: [] }),
    drafts: [
      ...(prev?.drafts ?? []),
      {
        id: "d_human",
        channel: "social",
        contact: "Klient",
        inbound: "otázka",
        reply: "napsal člověk",
        questions: [],
        confidence: 90,
        risks: [],
        status: "approved",
        autoApproved: false,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ],
  }));
  const { row, secret } = await mintInboundToken(U, P, "social");
  await hubPost(row.token, JSON.stringify({ entry: [{ messaging: [{ sender: { id: "z" }, message: { mid: "m_z", text: "nová" } }] }] }), secret);
  const human = (await getTwin(P)).drafts.find((d) => d.id === "d_human");
  assert.ok(human);
  assert.equal(human.reply, "napsal člověk");
  assert.equal(human.status, "approved");
});
