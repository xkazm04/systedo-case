/** ADR-0017: the curated music channel catalog and the metadata audit built on
 *  it. The catalog is the baseline a CLI-less install runs on, so its shape is
 *  held here; the audit decides what the onboarding tells an artist is missing,
 *  so a wrong answer there is a release delivered with gaps. Pure. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { MUSIC_CHANNELS, requiredMetadata } = await import("@/lib/music/channel-catalog");
const { auditTrack, fieldSatisfied } = await import("@/lib/music/track");

test("catalog rows are unique, dated and honest about their source", () => {
  const ids = MUSIC_CHANNELS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate channel id");
  for (const c of MUSIC_CHANNELS) {
    assert.ok(c.verifiedOn === "unverified" || /^\d{4}-\d{2}-\d{2}$/.test(c.verifiedOn), `${c.id}: verifiedOn`);
    assert.match(c.url, /^https:\/\//, `${c.id}: url`);
    assert.ok(c.requires.length > 0, `${c.id}: requires nothing`);
    if (c.connector === "api") assert.ok(c.readable?.length, `${c.id}: an api connector must say what it reads`);
    else assert.equal(c.readable, undefined, `${c.id}: only an api connector reads numbers`);
  }
});

test("Spotify is a distribution target only — never a connected source (descoped 2026-10-13)", () => {
  const spotify = MUSIC_CHANNELS.find((c) => c.id === "spotify");
  assert.equal(spotify.connector, "none");
  assert.equal(spotify.viaDistributor, true);
});

test("required metadata is the union of the chosen channels, attributed", () => {
  const req = requiredMetadata(["youtube", "lastfm"]);
  assert.deepEqual(req.get("title"), ["youtube", "lastfm"]);
  assert.equal(req.has("isrc"), false, "neither YouTube nor Last.fm asks for an ISRC");
  assert.equal(requiredMetadata(["nonexistent"]).size, 0);
});

const base = { title: "Night Drive", artists: ["Mira"] };

test("a malformed code is a gap, not a value", () => {
  assert.equal(fieldSatisfied({ ...base, isrc: "CZ-ABC-26-00001" }, "isrc"), true);
  assert.equal(fieldSatisfied({ ...base, isrc: "CZABC2600001" }, "isrc"), true);
  assert.equal(fieldSatisfied({ ...base, isrc: "12345" }, "isrc"), false);
  assert.equal(fieldSatisfied({ ...base, upc: "12345678901" }, "upc"), false);
  assert.equal(fieldSatisfied({ ...base, artworkUrl: "a.jpg", artworkPx: 1400 }, "artwork"), false);
  assert.equal(fieldSatisfied({ ...base, language: "instrumental" }, "lyrics"), true);
  assert.equal(fieldSatisfied({ ...base, explicit: false }, "explicit"), true, "false is an answer");
});

test("the audit orders gaps by how many chosen channels wait on them", () => {
  const audit = auditTrack(base, ["spotify", "apple-music", "youtube"]);
  assert.ok(audit.readiness > 0 && audit.readiness < 1);
  assert.equal(audit.gaps[0].neededBy.length, 3, "a field all three need comes first");
  const isrc = audit.gaps.find((g) => g.field === "isrc");
  assert.deepEqual(isrc.neededBy, ["Spotify", "Apple Music"]);
  assert.ok(audit.satisfied.includes("title"));
});

test("nothing chosen means nothing missing", () => {
  assert.deepEqual(auditTrack(base, []), { gaps: [], satisfied: [], readiness: 1 });
});
