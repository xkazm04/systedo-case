/** WP S1 — the Sklik WRITE surface of `SklikClient`, pinned over a fixture
 *  transport. No network: the transport is the injectable seam the whole client was
 *  built around, so what runs here is the real client — the real session handshake,
 *  the real method constants, the real status-envelope check.
 *
 *  What this file exists to pin is RAIL 1 of WP S1: the wire method name and the
 *  two status literals are ISOLATED constants whose failure DEGRADES. So every
 *  assertion below is about the exact `[method, params]` that reach the wire, and
 *  the red half — a transport that does not recognise the constant — is asserted
 *  next to the green one. */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  SklikClient,
  SklikApiError,
  SKLIK_CAMPAIGN_UPDATE_METHOD,
  SKLIK_STATUS_ACTIVE,
  SKLIK_STATUS_SUSPEND,
} = await import("@/lib/sklik/client");

const CAMPAIGNS = [
  { id: 101, name: "Donor", status: "active", type: "fulltext", dayBudget: 1000, deleted: false },
  { id: 102, name: "Recipient", status: "active", type: "fulltext", dayBudget: 500, deleted: false },
  { id: 103, name: "Smazaná", status: "active", dayBudget: 900, deleted: true },
];

/** A fixture transport that recognises exactly the methods it is told to, records
 *  every call, and rotates the session like the real API. `updateMethod` is a knob
 *  on purpose: pointing it at a DIFFERENT name is how the "wrong constant" half of
 *  rail 1 is proven. */
function fixtureTransport({ updateMethod = SKLIK_CAMPAIGN_UPDATE_METHOD, updateStatus = 200 } = {}) {
  const calls = [];
  let n = 0;
  return {
    calls,
    methods: () => calls.map((c) => c.method),
    async call(method, params) {
      calls.push({ method, params });
      if (method === "client.loginByToken") return { session: `sess-${++n}`, status: 200 };
      if (method === "campaigns.list") return { session: `sess-${++n}`, status: 200, campaigns: CAMPAIGNS };
      if (method === updateMethod) {
        return updateStatus >= 300
          ? { status: updateStatus, statusMessage: "Insufficient rights" }
          : { session: `sess-${++n}`, status: updateStatus };
      }
      throw new Error(`unexpected Sklik method ${method}`);
    },
  };
}

// --- rail 1: the constants are the contract ------------------------------------

test("[S1 rail 1] the write constants are exactly the documented literals", () => {
  // Pinned by value, not just by existence: these three strings are the only part
  // of the write path that cannot be verified offline, so a silent rename has to
  // fail here before it can reach an account.
  assert.equal(SKLIK_CAMPAIGN_UPDATE_METHOD, "campaigns.update");
  assert.equal(SKLIK_STATUS_ACTIVE, "active");
  assert.equal(SKLIK_STATUS_SUSPEND, "suspend");
});

test("[S1 rail 1] RED: a transport that does not know the constant makes the write throw, never silently succeed", async () => {
  // The wrong-name world: the transport speaks "campaign.update" (singular) and the
  // client's constant does not. This is what a bad guess looks like on a real
  // account — a throw, not a mutation.
  const tr = fixtureTransport({ updateMethod: "campaign.update" });
  const client = new SklikClient(tr, "tok");
  await assert.rejects(
    () => client.setCampaignDayBudget(101, 733),
    /unexpected Sklik method campaigns\.update/,
    "the wrong method degrades to a throw the mutation layer turns into ok:false"
  );
  assert.deepEqual(
    tr.methods(),
    ["client.loginByToken", "campaigns.update"],
    "and it got no further than the login + the one rejected call"
  );
});

test("[S1 rail 1] GREEN: with the constant recognised, a budget write sends exactly [user, [{id, dayBudget}]]", async () => {
  const tr = fixtureTransport();
  const client = new SklikClient(tr, "tok");
  await client.setCampaignDayBudget(101, 733);

  assert.deepEqual(tr.methods(), ["client.loginByToken", SKLIK_CAMPAIGN_UPDATE_METHOD], "login FIRST, then the write");
  const [method, params] = [tr.calls[1].method, tr.calls[1].params];
  assert.equal(method, "campaigns.update");
  assert.deepEqual(
    params,
    [{ session: "sess-1" }, [{ id: 101, dayBudget: 733 }]],
    "the exact wire payload: the {session} user struct, then an array of partial campaigns keyed by numeric id"
  );
  assert.equal(typeof params[1][0].id, "number", "ids go back to Number (the adapter stringified them)");
});

test("[S1] a budget write rounds to whole koruny — dayBudget is an integer CZK cap", async () => {
  const tr = fixtureTransport();
  await new SklikClient(tr, "tok").setCampaignDayBudget(101, 733.49);
  assert.deepEqual(tr.calls[1].params[1], [{ id: 101, dayBudget: 733 }]);
});

test("[S1 rail 1] pause / resume send the status literals, not booleans or enums", async () => {
  const tr = fixtureTransport();
  const client = new SklikClient(tr, "tok");
  await client.setCampaignStatus(101, SKLIK_STATUS_SUSPEND);
  await client.setCampaignStatus(101, SKLIK_STATUS_ACTIVE);

  assert.deepEqual(tr.calls[1].params[1], [{ id: 101, status: "suspend" }], "pause");
  assert.deepEqual(tr.calls[2].params[1], [{ id: 101, status: "active" }], "resume");
  assert.deepEqual(tr.methods(), [
    "client.loginByToken",
    SKLIK_CAMPAIGN_UPDATE_METHOD,
    SKLIK_CAMPAIGN_UPDATE_METHOD,
  ]);
});

// --- session + envelope --------------------------------------------------------

test("[S1] a write never runs without login(), and adopts the rotated session", async () => {
  const tr = fixtureTransport();
  const client = new SklikClient(tr, "tok");
  await client.setCampaignDayBudget(101, 10);
  await client.setCampaignDayBudget(102, 20);

  assert.equal(tr.calls[0].method, "client.loginByToken", "the very first call is the handshake");
  assert.deepEqual(tr.calls[0].params, ["tok"]);
  assert.equal(tr.calls[1].params[0].session, "sess-1", "the first write uses the login session");
  assert.equal(
    tr.calls[2].params[0].session,
    "sess-2",
    "the second uses the session the FIRST WRITE rotated — writes refresh like reads"
  );
  assert.equal(
    tr.methods().filter((m) => m === "client.loginByToken").length,
    1,
    "the session is cached; a second write does not re-authenticate"
  );
});

test("[S1] a write re-asserts Sklik's status envelope even when the transport does not throw", async () => {
  // The real HTTP transport throws on status >= 300, so this is belt-and-braces by
  // design: no other transport may make a REFUSED mutation look like a landed one.
  const tr = fixtureTransport({ updateStatus: 401 });
  const client = new SklikClient(tr, "tok");
  await assert.rejects(
    () => client.setCampaignDayBudget(101, 733),
    (err) => {
      assert.ok(err instanceof SklikApiError, "a typed error, so the live-retry classifier can read .status");
      assert.equal(err.status, 401);
      assert.match(err.message, /Insufficient rights/);
      return true;
    }
  );
});

// --- the read half of a shift ---------------------------------------------------

test("[S1] readCampaignBudgets reuses campaigns.list — ONE read, no second unverifiable method", async () => {
  const tr = fixtureTransport();
  const budgets = await new SklikClient(tr, "tok").readCampaignBudgets([101, 102]);

  assert.deepEqual(tr.methods(), ["client.loginByToken", "campaigns.list"], "no new method name is introduced");
  assert.equal(budgets.size, 2);
  assert.equal(budgets.get(101), 1000, "native CZK — no micros division anywhere on the Sklik side");
  assert.equal(budgets.get(102), 500);
});

test("[S1] readCampaignBudgets omits unknown / deleted campaigns rather than guessing a budget", async () => {
  const tr = fixtureTransport();
  const budgets = await new SklikClient(tr, "tok").readCampaignBudgets([102, 103, 999]);
  assert.deepEqual([...budgets.keys()], [102], "103 is deleted (filtered by listCampaigns), 999 does not exist");
  assert.equal((await new SklikClient(fixtureTransport(), "tok").readCampaignBudgets([])).size, 0);
});
