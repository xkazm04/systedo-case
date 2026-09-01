/** The HTTP surface, derived from the tree — the half of `docs/api/openapi.json`
 *  that no one gets to hand-write.
 *
 *  WHY THIS EXISTS. SECURITY.md puts `src/app/api/` in scope and the docs describe
 *  those handlers well, in prose. Prose is not an artefact a change can be compared
 *  against: an agent editing a route has nothing that says what the contract WAS,
 *  and nothing goes red when the edit changes it. `npm run sast -- --inventory`
 *  already prints the shape (path, methods, guard) — it prints it and forgets it.
 *  This module makes the same derivation available as data, so the printed
 *  inventory can become a committed document with a check behind it.
 *
 *  WHAT IS DERIVED, AND THEREFORE WHAT IS PINNED. Four facts per route, every one
 *  of them mechanical — read out of the filesystem and the export list, never
 *  guessed:
 *
 *    path          the URL, with Next's `[id]` / `[...slug]` segments rewritten to
 *                  OpenAPI's `{id}` / `{slug}` templates
 *    methods       the HTTP verbs the module actually exports, in canonical order
 *    parameters    the path parameters, in the order the segments appear
 *    auth          WHICH identity the handler establishes before it acts
 *    maxDuration   the Vercel function budget, when the route sets one
 *
 *  Prose — summaries, descriptions, request and response shapes — is the author's
 *  and is deliberately NOT derived: a generated sentence about a route is the kind
 *  of documentation that reads as informative and says nothing. What the check does
 *  insist on is that every operation HAS one, so a route cannot land undescribed.
 *
 *  THE AUTH CLASSIFIER IS THE SAME ONE THE SECURITY GATE USES. `GUARD_RE` below is
 *  copied verbatim from `scripts/sast.mjs` (rule `route-auth`) on purpose: two
 *  different opinions about whether a handler establishes caller identity is worse
 *  than one, and if they ever drift, `test-unit/api-surface.test.mjs` says so out
 *  loud rather than letting the document and the gate disagree quietly.
 *
 *  Pure and zero-dependency: reads files, runs nothing, spends nothing.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Canonical order for every verb list this module produces, so a re-derivation is
 *  byte-stable and a diff of the document is a diff of the surface. */
export const VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** Anything that proves a handler established WHO is calling before it acts.
 *  VERBATIM from scripts/sast.mjs § GUARD_RE — see the module header. */
export const GUARD_RE =
  /currentUserId|currentSession|requireAdmin|isAdminEmail|cronAuthorized|from "@\/auth"|auth\(\)|require[A-Za-z]*Project|require[A-Za-z]*User|requireSession|api-guard|rejectUnknownProject/;

/** The four postures a route may hold, and what each one means for a caller.
 *  `unguarded` is not a posture anyone chooses — it is the finding. */
export const POSTURES = {
  session: "A signed-in Auth.js session. The tenant key is derived from the session, never from the wire (ADR-0002).",
  cron: "A CRON_SECRET bearer token, compared in constant time by src/lib/cron-auth.ts.",
  public:
    "Deliberately anonymous, with the reason recorded in .github/security/sast-allowlist.json § route-auth. " +
    "Where a path token is the credential, the (userId, projectId) pairing is read from the stored row.",
  authjs: "The Auth.js handler itself — this route IS the sign-in surface, so it establishes the session rather than requiring one.",
  unguarded: "No caller identity established and no allowlist entry. This is a finding, not a posture.",
};

const ROUTE_ROOT = "src/app/api";
const ALLOWLIST_REL = ".github/security/sast-allowlist.json";

/** Every `route.ts` under src/app/api, as repo-relative POSIX paths, sorted. */
export function routeFiles(root) {
  const dir = join(root, ...ROUTE_ROOT.split("/"));
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name === "route.ts")
    .map((e) => {
      const parent = (e.parentPath ?? e.path).replaceAll("\\", "/");
      const rel = parent.slice(parent.indexOf(ROUTE_ROOT));
      return `${rel}/route.ts`;
    })
    .sort();
}

/** Next's directory conventions → an OpenAPI path template.
 *  `[id]` → `{id}`, `[...slug]` → `{slug}` (flagged as a catch-all), `(group)`
 *  segments are stripped the way the router strips them. */
export function toOpenApiPath(relFile) {
  const segments = relFile
    .slice(ROUTE_ROOT.length + 1)
    .replace(/\/route\.ts$/, "")
    .split("/")
    .filter(Boolean);

  const params = [];
  const out = [];
  for (const seg of segments) {
    if (/^\(.*\)$/.test(seg)) continue; // route group — not part of the URL
    const dynamic = /^\[+(\.{3})?([^\]]+)\]+$/.exec(seg);
    if (!dynamic) {
      out.push(seg);
      continue;
    }
    const name = dynamic[2];
    params.push({ name, catchAll: Boolean(dynamic[1]) });
    out.push(`{${name}}`);
  }
  return { path: `/api${out.length ? `/${out.join("/")}` : ""}`, params };
}

/** The verbs a route module exports, in canonical order. Three shapes reach the
 *  router and all three are read here: a declared function, a named const, and the
 *  destructured re-export the Auth.js catch-all uses. */
export function exportedMethods(text) {
  const found = new Set();
  for (const m of text.matchAll(/^export\s+(?:async\s+)?function\s+([A-Z]+)\b/gm)) found.add(m[1]);
  for (const m of text.matchAll(/^export\s+const\s+([A-Z]+)\s*[:=]/gm)) found.add(m[1]);
  for (const m of text.matchAll(/^export\s+const\s*\{([^}]*)\}\s*=/gm)) {
    for (const name of m[1].split(",")) found.add(name.trim().split(":")[0].trim());
  }
  return VERBS.filter((v) => found.has(v));
}

/** Which identity the handler establishes, decided in the one order that makes the
 *  answers exclusive. `publicAllowlist` is the set of repo-relative paths carrying a
 *  written `route-auth` exception. */
export function authPosture(relFile, text, publicAllowlist) {
  if (/from\s+"@\/auth"/.test(text) && /export\s+const\s*\{[^}]*\}\s*=\s*handlers/.test(text)) return "authjs";
  if (/\bcronAuthorized\b/.test(text)) return "cron";
  if (GUARD_RE.test(text)) return "session";
  if (publicAllowlist.has(relFile)) return "public";
  return "unguarded";
}

/** The `route-auth` exceptions, as a set of repo-relative paths. An entry with no
 *  reason string is ignored — the same rule sast.mjs applies, so "add it to the
 *  list" is never a one-word edit here either. */
export function publicAllowlist(root) {
  const file = join(root, ...ALLOWLIST_REL.split("/"));
  if (!existsSync(file)) return new Set();
  const json = JSON.parse(readFileSync(file, "utf8"));
  return new Set(
    Object.entries(json["route-auth"] ?? {})
      .filter(([, reason]) => typeof reason === "string" && reason.trim().length > 0)
      .map(([path]) => path)
  );
}

/** The whole surface as data, keyed by OpenAPI path. */
export function deriveSurface(root) {
  const allowlist = publicAllowlist(root);
  const surface = {};
  for (const rel of routeFiles(root)) {
    const text = readFileSync(join(root, ...rel.split("/")), "utf8");
    const { path, params } = toOpenApiPath(rel);
    const maxDuration = /^export\s+const\s+maxDuration\s*=\s*(\d+)/m.exec(text);
    surface[path] = {
      source: rel,
      methods: exportedMethods(text),
      parameters: params,
      auth: authPosture(rel, text, allowlist),
      ...(maxDuration ? { maxDuration: Number(maxDuration[1]) } : {}),
    };
  }
  return surface;
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Compare the tree against a committed OpenAPI document and return findings.
 *
 *  Each finding is `{ path, kind, detail }`. The kinds are deliberately specific,
 *  because the remedy differs: `undocumented` and `phantom` are answered by
 *  regenerating, `auth` almost never is — a posture that moved is either a security
 *  change somebody meant, or the one they did not. */
export function compareSurface(derived, doc) {
  const findings = [];
  const documented = doc?.paths ?? {};

  for (const [path, actual] of Object.entries(derived)) {
    const item = documented[path];
    if (!item) {
      findings.push({ path, kind: "undocumented", detail: `${actual.source} serves ${actual.methods.join(", ") || "no verb"} and the spec does not describe it` });
      continue;
    }
    const pinned = item["x-adamant"] ?? {};

    if (pinned.source !== actual.source) {
      findings.push({ path, kind: "source", detail: `spec points at ${pinned.source ?? "nothing"}, the router serves ${actual.source}` });
    }

    const specMethods = VERBS.filter((v) => v.toLowerCase() in item);
    if (!eq(specMethods, actual.methods)) {
      findings.push({ path, kind: "methods", detail: `spec documents [${specMethods.join(", ")}], the module exports [${actual.methods.join(", ")}]` });
    }

    const specParams = (item.parameters ?? []).map((p) => ({ name: p.name, catchAll: Boolean(p["x-catch-all"]) }));
    if (!eq(specParams, actual.parameters)) {
      const shape = (ps) => ps.map((p) => (p.catchAll ? `...${p.name}` : p.name)).join(", ") || "none";
      findings.push({ path, kind: "parameters", detail: `spec declares (${shape(specParams)}), the path template needs (${shape(actual.parameters)})` });
    }

    if (pinned.auth !== actual.auth) {
      findings.push({ path, kind: "auth", detail: `spec says \`${pinned.auth ?? "nothing"}\`, the handler establishes \`${actual.auth}\``});
    }
    if (actual.auth === "unguarded") {
      findings.push({ path, kind: "unguarded", detail: `${actual.source} establishes no caller identity and carries no route-auth exception` });
    }

    const specDuration = pinned.maxDuration ?? null;
    const actualDuration = actual.maxDuration ?? null;
    if (specDuration !== actualDuration) {
      findings.push({ path, kind: "maxDuration", detail: `spec says ${specDuration ?? "the platform default"}, the module exports ${actualDuration ?? "no maxDuration"}` });
    }

    // Every operation the spec documents must carry a sentence and the posture's
    // security requirement. A route that lands with a TODO is a route nobody
    // described, and the whole point of the artefact is that it can be read.
    for (const verb of specMethods) {
      const op = item[verb.toLowerCase()];
      const summary = typeof op?.summary === "string" ? op.summary.trim() : "";
      if (!summary || /^todo\b/i.test(summary)) {
        findings.push({ path, kind: "undescribed", detail: `${verb} has no summary — say in one sentence what it does` });
      }
      if (!Array.isArray(op?.security)) {
        findings.push({ path, kind: "security", detail: `${verb} declares no \`security\` — it must state the \`${actual.auth}\` posture` });
      }
    }
  }

  for (const path of Object.keys(documented)) {
    if (!(path in derived)) {
      findings.push({ path, kind: "phantom", detail: "the spec describes a route the router no longer serves" });
    }
  }

  return findings;
}
