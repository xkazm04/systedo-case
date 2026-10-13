/**
 * Brand asset generator — Leonardo, offline, on demand.
 *
 * WHAT THIS IS FOR. The landing rebuild needs illustration the tree does not have:
 * three parallax planes, three prism skins, three band plates and two missing crossroad
 * tiles (docs/ship/2026-09-08-landing-motion-rebuild.md). Those are BRAND assets — they
 * ship in `public/`, they are committed, and they are regenerated deliberately — not
 * user content, so they do not belong on the metered Creative Studio path.
 *
 * PROMPTS LIVE IN scripts/brand-assets.manifest.json, not here. A prompt is the design
 * decision; keeping it in data means re-generating an asset shows up as a reviewable diff
 * instead of as a binary that changed for reasons nobody wrote down.
 *
 * THE SEAM EXCEPTION, DECLARED. `src/lib/images/reaper.ts` states the house rule: every
 * Leonardo call goes through the client seam in `src/lib/leonardo/client.ts`, never a raw
 * fetch. This file breaks that rule on purpose and the reason is mechanical — that seam is
 * `@/`-aliased server TypeScript and cannot be imported by a bare-node `.mjs`, and
 * ADR-0008 requires everything in `scripts/` to run on a bare `node` with no dependencies.
 * What the rule protects is the RUNTIME path: metering (`usage.consume`), the spend
 * ledger, the reaper's cleanup contract, demo-mode fallback. None of that applies to a
 * build-time generator that runs when a human types the command. The model id and style
 * UUIDs below are copied from that seam and must be kept in step with it.
 *
 * SPENDING. This costs Leonardo credits, so it is AMBER under AGENTS.md § "What you may do
 * unattended": on demand only, never in `check`, `check:ci` or a hook, and the commit that
 * lands its output says what was generated. `--dry-run` prints every prompt and spends
 * nothing — use it first.
 *
 *   node scripts/leonardo-assets.mjs --dry-run          # what would be generated
 *   node scripts/leonardo-assets.mjs --only hero-mass   # one asset
 *   node scripts/leonardo-assets.mjs --force            # regenerate what already exists
 *   node scripts/leonardo-assets.mjs --list             # ids + roles + current state
 *
 * By default an asset that already exists on disk is SKIPPED, so a re-run after a failure
 * costs nothing for the ones that landed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MANIFEST = resolve(__dirname, "brand-assets.manifest.json");
const PROVENANCE = resolve(ROOT, "public/brand/monolith/PROVENANCE.json");

// --- the Leonardo surface, copied from src/lib/leonardo/client.ts ------------
const BASE = "https://cloud.leonardo.ai/api/rest/v1";
const LUCID_ORIGIN_MODEL = "7b592283-e8a7-4c5a-9ba6-d18c31f258b9";
const STYLE_UUIDS = {
  bokeh: "9fdc5e8c-4d13-49b4-9ce6-5a74cbb19177",
  cinematic: "a5632c7c-ddbb-4e2f-ba34-8456ab3ac436",
  dynamic: "111dc692-d470-4eec-b791-3475abac4c46",
  fashion: "594c4a08-a522-4e0e-b7ff-e4dac4b6b622",
  portrait: "8e2bc543-6ee2-45f9-bcd9-594b6ce84dcd",
  vibrant: "dee282d3-891f-4f73-ba02-7f8131e5541b",
};
const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 60; // 4 minutes — no route timeout to fit inside here

const EXT_BY_MIME = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// --- argv -------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
function flagValue(name) {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}
const DRY_RUN = has("--dry-run");
const FORCE = has("--force");
const LIST = has("--list");
const ONLY = flagValue("--only");

/** `.env.local` then `.env`, exactly the precedence Next itself uses. Values already in
 *  the environment win, so CI or a shell export is never overwritten by a file. */
function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(ROOT, name);
    if (!existsSync(p)) continue;
    try {
      process.loadEnvFile(p);
    } catch {
      /* malformed or unreadable — the key check below reports the consequence */
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One REST call. The key is read at call time and never logged; Leonardo's error bodies
 *  are truncated the way the runtime seam truncates them, because a 400 can echo the
 *  whole request back. */
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${process.env.LEONARDO_API_KEY ?? ""}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Leonardo ${method} ${path} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function pollGeneration(id) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const data = await api("GET", `/generations/${id}`);
    const gen = data.generations_by_pk;
    if (!gen) continue;
    if (gen.status === "COMPLETE") return gen.generated_images ?? [];
    if (gen.status === "FAILED") throw new Error(`Leonardo generation ${id} FAILED`);
    process.stdout.write(".");
  }
  throw new Error(`Leonardo generation ${id} timed out after ${MAX_POLL_ATTEMPTS} polls`);
}

/** An asset is "already there" when any extension of its `out` stem exists on disk — the
 *  CDN decides the format, so the generator cannot know the filename before it runs. */
function existingFile(outStem) {
  const dir = resolve(ROOT, dirname(outStem));
  if (!existsSync(dir)) return null;
  const stem = basename(outStem);
  const hit = readdirSync(dir).find((f) => f.replace(/\.[^.]+$/, "") === stem);
  return hit ? resolve(dir, hit) : null;
}

async function generateOne(asset, defaults) {
  const prompt = `${asset.prompt}, ${defaults.negativeTail}`;
  const style = asset.style ?? defaults.style;
  const styleUUID = STYLE_UUIDS[style];
  if (!styleUUID) throw new Error(`${asset.id}: unknown style "${style}"`);

  if (DRY_RUN) {
    console.log(`\n── ${asset.id} → ${asset.out} (${asset.width}×${asset.height}, ${style})`);
    console.log(`   ${asset.role}`);
    console.log(`   ${prompt}`);
    return null;
  }

  process.stdout.write(`  ${asset.id} submitting`);
  const submit = await api("POST", "/generations", {
    prompt,
    modelId: LUCID_ORIGIN_MODEL,
    width: asset.width,
    height: asset.height,
    num_images: 1,
    contrast: asset.contrast ?? defaults.contrast ?? 3.5,
    alchemy: false,
    ultra: false,
    styleUUID,
  });
  const generationId = submit.sdGenerationJob?.generationId;
  if (!generationId) throw new Error(`${asset.id}: Leonardo returned no generationId`);

  const images = await pollGeneration(generationId);
  const url = images.find((i) => i.url)?.url;
  if (!url) throw new Error(`${asset.id}: generation completed with no downloadable image`);

  const res = await fetch(url);
  // The quota is already spent at this point, so a CDN refusal is an error worth seeing
  // rather than a silent skip that leaves a gap in the page.
  if (!res.ok) throw new Error(`${asset.id}: CDN returned ${res.status} for the finished image`);
  const mime = (res.headers.get("content-type") ?? "image/png").split(";")[0].trim();
  const ext = EXT_BY_MIME[mime] ?? "png";
  const outPath = resolve(ROOT, `${asset.out}.${ext}`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  console.log(` ✓ ${asset.out}.${ext}`);

  return {
    id: asset.id,
    file: `${asset.out}.${ext}`,
    prompt,
    style,
    styleUUID,
    model: LUCID_ORIGIN_MODEL,
    width: asset.width,
    height: asset.height,
    generationId,
    generatedAt: new Date().toISOString(),
  };
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const defaults = manifest.defaults ?? {};
  let assets = manifest.assets;
  if (ONLY) {
    assets = assets.filter((a) => a.id === ONLY);
    if (assets.length === 0) {
      console.error(`No asset with id "${ONLY}". Known ids: ${manifest.assets.map((a) => a.id).join(", ")}`);
      process.exit(1);
    }
  }

  if (LIST) {
    for (const a of manifest.assets) {
      const at = existingFile(a.out);
      console.log(`${at ? "✓" : "·"} ${a.id.padEnd(20)} ${a.width}×${a.height}  ${a.role}`);
    }
    return;
  }

  loadEnvFiles();
  if (!DRY_RUN && !process.env.LEONARDO_API_KEY) {
    console.error(
      "LEONARDO_API_KEY is not set — put it in .env.local (never in a committed file) or\n" +
        "export it for this shell. Run with --dry-run to see the prompts without a key."
    );
    process.exit(1);
  }

  const todo = FORCE ? assets : assets.filter((a) => !existingFile(a.out));
  const skipped = assets.length - todo.length;
  console.log(
    `${DRY_RUN ? "DRY RUN — " : ""}${todo.length} asset(s) to generate` +
      (skipped ? `, ${skipped} already on disk (--force to redo)` : "")
  );

  const records = [];
  const failures = [];
  for (const asset of todo) {
    try {
      const rec = await generateOne(asset, defaults);
      if (rec) records.push(rec);
    } catch (err) {
      // Keep going: one refused prompt should not cost the other nine their generations.
      console.error(`\n  ✗ ${asset.id}: ${err instanceof Error ? err.message : String(err)}`);
      failures.push(asset.id);
    }
  }

  if (records.length > 0) {
    // Provenance is merged, not replaced, so regenerating one asset does not erase where
    // the other ten came from.
    const prior = existsSync(PROVENANCE) ? JSON.parse(readFileSync(PROVENANCE, "utf8")) : { assets: {} };
    for (const rec of records) prior.assets[rec.id] = rec;
    prior.note =
      "Generated by scripts/leonardo-assets.mjs from scripts/brand-assets.manifest.json. " +
      "Prompts are the design decision and live in the manifest; this file records what was " +
      "actually run and when.";
    mkdirSync(dirname(PROVENANCE), { recursive: true });
    writeFileSync(PROVENANCE, `${JSON.stringify(prior, null, 2)}\n`);
    console.log(`\nProvenance written: ${records.length} record(s) → public/brand/monolith/PROVENANCE.json`);
  }

  if (failures.length > 0) {
    console.error(`\nFailed: ${failures.join(", ")} — re-run with --only <id> once the prompt is fixed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
