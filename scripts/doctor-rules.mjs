/** Pure rules for `npm run doctor` — map the env matrix to the product surfaces
 *  it enables. Framework-free and side-effect-free so the logic is unit-testable
 *  (test-unit/doctor.test.mjs); all I/O probes (CLI presence, file existence)
 *  are gathered by scripts/doctor.mjs and passed in.
 *
 *  The app is six products behind one env matrix (see .env.example): public
 *  site, AI tools (Claude CLI in dev / Gemini in prod / demo mode), the /app
 *  workspace (Auth.js + Firestore, or DEV_AUTH+LOCAL_DB offline), cron+alerts,
 *  Creative Studio and live Google Ads. Each row's hint reuses the fix copy
 *  already written in .env.example.
 */

/** Node >= 22.5 — node:sqlite (src/lib/db.ts) needs it; mirrors package.json engines. */
export function nodeSatisfies(version, minMajor = 22, minMinor = 5) {
  const m = /^v?(\d+)\.(\d+)/.exec(String(version));
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > minMajor || (major === minMajor && minor >= minMinor);
}

const set = (v) => typeof v === "string" && v.trim() !== "";

/**
 * @param {Record<string, string | undefined>} env - process.env after loadEnvConfig
 * @param {{
 *   nodeVersion: string,
 *   claudeCli: string | null,
 *   saFile: boolean,
 *   gacFile: boolean,
 *   localDbFile: boolean,
 * }} probes
 * @returns {Array<{ surface: string, status: "on"|"demo"|"off"|"error", detail: string, hint?: string }>}
 */
export function buildDoctorReport(env, probes) {
  const rows = [];

  // --- Node runtime ----------------------------------------------------------
  if (nodeSatisfies(probes.nodeVersion)) {
    rows.push({
      surface: "Node.js runtime",
      status: "on",
      detail: `${probes.nodeVersion} (>= 22.5, node:sqlite k dispozici)`,
    });
  } else {
    rows.push({
      surface: "Node.js runtime",
      status: "error",
      detail: `${probes.nodeVersion} — package.json vyžaduje >= 22.5 (node:sqlite)`,
      hint: "Nainstaluj Node 22.5+ (rate-limiter a LOCAL_DB stojí na vestavěném node:sqlite).",
    });
  }

  // --- AI tools: dev provider (Claude Code CLI) ------------------------------
  if (probes.claudeCli) {
    rows.push({
      surface: "AI nástroje — dev (Claude CLI)",
      status: "on",
      detail: `claude CLI nalezeno (${probes.claudeCli}) — npm run dev jede přes předplatné, bez klíče`,
    });
  } else {
    rows.push({
      surface: "AI nástroje — dev (Claude CLI)",
      status: "demo",
      detail: "claude CLI nenalezeno — v devu poběží nástroje v ukázkovém (demo) režimu",
      hint: "Nainstaluj a přihlas Claude Code (příkaz `claude`); žádný klíč do .env není potřeba.",
    });
  }

  // --- AI tools: production provider (Gemini) --------------------------------
  const geminiModel = set(env.GEMINI_MODEL) ? env.GEMINI_MODEL : "gemini-3-flash-preview (výchozí)";
  if (set(env.GEMINI_API_KEY)) {
    rows.push({
      surface: "AI nástroje — produkce (Gemini)",
      status: "on",
      detail: `GEMINI_API_KEY nastaven · model ${geminiModel}`,
    });
  } else {
    rows.push({
      surface: "AI nástroje — produkce (Gemini)",
      status: "demo",
      detail: "GEMINI_API_KEY chybí — produkční build poběží v ukázkovém (demo) režimu",
      hint: "Klíč zdarma v Google AI Studiu: https://aistudio.google.com/apikey → GEMINI_API_KEY.",
    });
  }

  // --- /app: sign-in (Auth.js) ------------------------------------------------
  const devAuth = env.DEV_AUTH === "true" && env.NODE_ENV !== "production";
  const authVars = ["AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
  const missingAuth = authVars.filter((k) => !set(env[k]));
  if (missingAuth.length === 0) {
    rows.push({
      surface: "/app — přihlášení (Auth.js)",
      status: "on",
      detail: "Google OAuth nakonfigurován (AUTH_SECRET + GOOGLE_CLIENT_ID/SECRET)",
    });
  } else if (devAuth) {
    rows.push({
      surface: "/app — přihlášení (Auth.js)",
      status: "on",
      detail: `DEV_AUTH=true — syntetický uživatel ${env.DEV_AUTH_USER_ID || "dev-user"} (ignoruje se v produkci)`,
    });
  } else if (missingAuth.length < authVars.length) {
    rows.push({
      surface: "/app — přihlášení (Auth.js)",
      status: "error",
      detail: `částečná konfigurace — chybí ${missingAuth.join(", ")}`,
      hint: "Doplň zbývající proměnné (viz SETUP.md), nebo pro offline vývoj nastav DEV_AUTH=true.",
    });
  } else {
    rows.push({
      surface: "/app — přihlášení (Auth.js)",
      status: "off",
      detail: "bez AUTH_SECRET + GOOGLE_CLIENT_ID/SECRET je přihlášení vypnuté",
      hint: "AUTH_SECRET: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"; OAuth klient viz .env.example. Offline alternativa: DEV_AUTH=true + LOCAL_DB=true (npm run dev:local).",
    });
  }

  // --- /app: data backend (Firestore / LOCAL_DB) ------------------------------
  const localDb = env.LOCAL_DB === "true" && env.NODE_ENV !== "production";
  const hasSaKey = set(env.FIREBASE_SERVICE_ACCOUNT) || probes.saFile || probes.gacFile;
  if (localDb) {
    rows.push({
      surface: "/app — data (LOCAL_DB)",
      status: "on",
      detail: probes.localDbFile
        ? "lokální node:sqlite (.data/systedo.db) — seednutá, /app funguje offline"
        : "lokální node:sqlite (.data/systedo.db) — soubor zatím neexistuje",
      hint: probes.localDbFile
        ? undefined
        : "Spusť `npm run seed:local` (založí dev uživatele + ukázkové projekty, /app/demo-eshop).",
    });
  } else if (set(env.GOOGLE_CLOUD_PROJECT) && hasSaKey) {
    const cred = set(env.FIREBASE_SERVICE_ACCOUNT)
      ? "FIREBASE_SERVICE_ACCOUNT"
      : probes.saFile
        ? ".data/firebase-sa.json"
        : "GOOGLE_APPLICATION_CREDENTIALS";
    rows.push({
      surface: "/app — data (Firestore)",
      status: "on",
      detail: `Firestore, projekt ${env.GOOGLE_CLOUD_PROJECT} (klíč: ${cred})`,
    });
  } else if (set(env.GOOGLE_CLOUD_PROJECT)) {
    rows.push({
      surface: "/app — data (Firestore)",
      status: "error",
      detail: `GOOGLE_CLOUD_PROJECT=${env.GOOGLE_CLOUD_PROJECT}, ale chybí service-account klíč`,
      hint: "Lokálně .data/firebase-sa.json (gcloud), v produkci FIREBASE_SERVICE_ACCOUNT s celým JSON klíčem.",
    });
  } else {
    rows.push({
      surface: "/app — data (Firestore)",
      status: "off",
      detail: "bez GOOGLE_CLOUD_PROJECT se /app data nemají kam ukládat",
      hint: "Nastav GOOGLE_CLOUD_PROJECT + service-account klíč, nebo offline: LOCAL_DB=true a `npm run seed:local`.",
    });
  }

  // --- Cron + alerts -----------------------------------------------------------
  const cronBits = [];
  if (set(env.CRON_SECRET)) cronBits.push("CRON_SECRET chrání /api/cron/*");
  if (set(env.RESEND_API_KEY)) cronBits.push("e-maily přes Resend");
  else cronBits.push("e-maily se jen logují");
  if (set(env.ALERT_WEBHOOK_URL)) cronBits.push("webhook (Slack/Teams/Discord)");
  rows.push({
    surface: "Cron + upozornění",
    status: set(env.CRON_SECRET) ? (set(env.RESEND_API_KEY) ? "on" : "demo") : "off",
    detail: set(env.CRON_SECRET)
      ? cronBits.join(" · ")
      : "bez CRON_SECRET není plánovaná synchronizace chráněná (Vercel Cron ho posílá jako Bearer token)",
    hint:
      set(env.CRON_SECRET) && set(env.RESEND_API_KEY)
        ? undefined
        : "CRON_SECRET = libovolné tajemství; RESEND_API_KEY z https://resend.com; volitelně ALERT_WEBHOOK_URL.",
  });

  // --- Creative Studio -----------------------------------------------------------
  const visionModel = set(env.GEMINI_VISION_MODEL) ? env.GEMINI_VISION_MODEL : geminiModel;
  if (set(env.LEONARDO_API_KEY) && set(env.GEMINI_API_KEY)) {
    rows.push({
      surface: "Creative Studio",
      status: "on",
      detail: `Leonardo generuje · Gemini vision hodnotí (model ${visionModel})`,
    });
  } else if (set(env.LEONARDO_API_KEY)) {
    rows.push({
      surface: "Creative Studio",
      status: "demo",
      detail: "Leonardo generuje, ale bez GEMINI_API_KEY neběží vision hodnocení kandidátů",
      hint: "Doplň GEMINI_API_KEY (společný s AI nástroji) — vision model se odvodí z GEMINI_MODEL.",
    });
  } else {
    rows.push({
      surface: "Creative Studio",
      status: "demo",
      detail: "bez LEONARDO_API_KEY běží studio v ukázkovém režimu (placeholdery)",
      hint: "Klíč z app.leonardo.ai → LEONARDO_API_KEY.",
    });
  }

  // --- Google Ads (live sync) ------------------------------------------------------
  if (set(env.GOOGLE_ADS_DEVELOPER_TOKEN)) {
    rows.push({
      surface: "Google Ads (živá data)",
      status: "on",
      detail: `developer token nastaven${set(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) ? ` · MCC ${env.GOOGLE_ADS_LOGIN_CUSTOMER_ID}` : ""} — konektor volá API jménem přihlášeného uživatele`,
    });
  } else {
    rows.push({
      surface: "Google Ads (živá data)",
      status: "demo",
      detail: "bez GOOGLE_ADS_DEVELOPER_TOKEN zůstává /kampane na ukázkových datech",
      hint: "Developer token z Google Ads MANAGER účtu (Tools → API Center); u MCC doplň GOOGLE_ADS_LOGIN_CUSTOMER_ID.",
    });
  }

  return rows;
}
