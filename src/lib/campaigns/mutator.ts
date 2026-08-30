/** WP S1 — the per-platform WRITE seam. One interface (`AdsMutator`) that the
 *  audited mutation path (./mutations) dispatches every live change through, and one
 *  resolver (`mutatorForTenant`) that decides which network a tenant's writes go to
 *  — or refuses, with a code the console can turn into a next step.
 *
 *  WHY a seam at all: before S1 the mutation path spoke Google Ads directly (an
 *  access token, a customerId, budget micros, budget RESOURCE names). None of those
 *  four concepts exist on Sklik, which authenticates with a session, addresses
 *  campaigns by numeric id, and caps spend in whole koruny on the campaign itself.
 *  Rather than thread `if (sklik)` through four mutation functions, the differences
 *  live behind this interface and `mutations.ts` stays platform-blind.
 *
 *  WHY THE RAILS. This is the first code in the repo that changes a REAL Sklik
 *  account, and one of its inputs (the RPC method name) cannot be verified offline.
 *  Three independent rails each make an accidental first write impossible, and each
 *  is pinned red-then-green in test-unit/campaigns-mutator.test.mjs:
 *
 *   1. ISOLATED METHOD CONSTANTS THAT DEGRADE — the wire names live as constants in
 *      `sklik/client.ts` (`SKLIK_CAMPAIGN_UPDATE_METHOD`, `SKLIK_STATUS_*`). A wrong
 *      name throws at the transport, the mutation returns `{ ok: false }`, the
 *      change-set settles `failed` and nothing else in it moves. Wrong ⇒ inert.
 *   2. A SETTLED MONEY UNIT — {@link sklikWritable}. A Sklik account whose money-unit
 *      verdict is unsettled might be one where the native-CZK assumption is wrong; a
 *      budget written against the wrong unit is off by 100×. So a write is REFUSED
 *      until the verdict is `czk-plausible` or the owner confirmed haléře. This is a
 *      refusal, never a conversion — S1 converts nothing.
 *   3. A GLOBAL OFF SWITCH — {@link SKLIK_WRITES_ENV}, default OFF, so merging and
 *      deploying this work mutates nobody's account until the owner turns it on
 *      after the manual live proof (docs/deploy.md § "Sklik writes"). Deliberately
 *      NOT the `DEV_AUTH` prod-ignored pattern: production is exactly where it has
 *      to be turnable ON.
 *
 *  Server-only (it resolves credentials). Pure enough to unit-test: the Sklik
 *  transport is injectable, so the whole write path runs over a fixture. */
import { getSyncMeta } from "./store";
import { getAdsConnection } from "./connection";
import { getSklikConnection, getSklikToken, type SklikConnection } from "./sklik-connection";
import { getUserAccessToken } from "@/lib/google/token";
import {
  adsConfigured,
  fetchCampaignBudgets,
  pauseCampaign,
  resumeCampaign,
  setCampaignBudgetMicros,
} from "@/lib/google/ads";
import {
  SklikClient,
  httpSklikTransport,
  SKLIK_STATUS_ACTIVE,
  SKLIK_STATUS_SUSPEND,
  type SklikTransport,
} from "@/lib/sklik/client";

/** A campaign's current daily budget, in the shape (and UNIT) its own network uses.
 *  The discriminant carries the unit so a caller cannot mix micros with koruny:
 *  Google budgets are micros of the ACCOUNT currency and live on a shared
 *  CampaignBudget resource; Sklik budgets are whole CZK on the campaign itself. */
export type PlatformBudget =
  | {
      platform: "google-ads";
      /** absent when the target was rebuilt from a legacy budget snapshot, which
       *  stored only the budget resource — the write does not need it. */
      campaignId?: string;
      budgetResourceName: string;
      amountMicros: number;
    }
  | { platform: "sklik"; campaignId: string; dayBudgetCzk: number };

/**
 * One ad network's write surface, as the audited mutation path needs it.
 *
 * DEVIATION from the wp-S1 data contract, deliberate: `setBudget`'s amount is named
 * `amount`, not `czkPerDay`, and is expressed in the TARGET's own unit (micros for
 * Google, CZK for Sklik). Google Ads micros are micros of the ACCOUNT currency —
 * this app already syncs and labels non-CZK Ads accounts — so calling that number
 * "czkPerDay" would be wrong for a EUR account, and converting through CZK would put
 * a lossy round-trip in front of a write that today passes its micros through
 * untouched. The unit travels with the discriminant instead.
 *
 * TODO(S1b — keyword/query moves): S1b needs criterion-level writes (negative
 * keywords, keyword-level bids/pause). They are NOT added here: adding a
 * `setCriterion*` to this interface would force the Google implementation to grow a
 * second `:mutate` endpoint before anything calls it. The extension points S1b
 * should use, in preference order:
 *   (a) EXTEND THIS INTERFACE with optional members — `pauseCriterion?(…)`,
 *       `addNegativeKeyword?(…)` — so a network that cannot do it simply omits them
 *       and `mutations.ts` degrades on `typeof mutator.x !== "function"` instead of
 *       throwing. Optionality is the seam; a required member would make every future
 *       network implement every future operation.
 *   (b) REUSE THE RESOLVER, not the interface: `mutatorForTenant` already returns the
 *       resolved tenant plus a typed refusal, and `MutatorRefusal` is the union the
 *       console switches on. A criterion mutator should resolve through the SAME
 *       function (adding its codes to that union) so rails 2 and 3 apply to it
 *       automatically — a keyword write must be gated exactly as hard as a budget one.
 *   (c) REUSE `sklikClientFor`, not `new SklikClient(...)`: it is the single place
 *       the transport is injected, so S1b's fixtures work the way S1's do and no
 *       test can reach the network.
 * Nothing here is added speculatively — this note is the extension point.
 */
export interface AdsMutator {
  readonly source: "google-ads" | "sklik";
  /** Human network name for the activity feed ("Google Ads" / "Sklik"). */
  readonly networkLabel: string;
  /** Fields identifying WHERE a write landed, spread into every audit doc this
   *  mutator produces. Google: `{ customerId }` — exactly the key the pre-S1 docs
   *  carried, and NO `platform`, so the Google audit trail stays byte-identical.
   *  Sklik: `{ platform: "sklik" }`. */
  readonly auditFields: Readonly<Record<string, string>>;
  pause(campaignId: string): Promise<void>;
  resume(campaignId: string): Promise<void>;
  readBudgets(ids: string[]): Promise<Map<string, PlatformBudget>>;
  /** Set `target`'s daily budget to `amount`, in the target's own unit (see the
   *  interface note): micros for `google-ads`, whole CZK for `sklik`. */
  setBudget(target: PlatformBudget, amount: number): Promise<void>;
}

/** Why a tenant has no mutator. Each code maps to one next step in the console. */
export type MutatorRefusal =
  | "sklik-writes-disabled"
  | "sklik-unit-unsettled"
  | "sklik-not-connected"
  | "google-not-configured"
  /** RESERVED. A sample/demo tenant currently falls through to the Google guards,
   *  whose three refusal messages are pinned byte-identical by WP S1's invariants —
   *  changing what a demo tenant is told is not this WP's business. Listed so the
   *  union is the complete vocabulary the console switches on. */
  | "sample-tenant";

export type MutatorResolution =
  | { ok: true; mutator: AdsMutator; tenant: string }
  | { ok: false; code: MutatorRefusal; error: string };

/** Rail 3 — the global Sklik write switch. Named once, read at CALL time (never
 *  captured at module load), so a deploy can flip it without a rebuild. */
export const SKLIK_WRITES_ENV = "SKLIK_WRITES_ENABLED";

/** Rail 3's rule: `"1"` and nothing else. Absent, empty, "true", "yes" and any typo
 *  all read as OFF — an accidentally-truthy value must not be able to arm real
 *  account mutations. Note what is NOT here: no `NODE_ENV === "production"` escape
 *  hatch. `DEV_AUTH`/`LOCAL_DB` are ignored in production because they WEAKEN the
 *  system; this flag is the thing production has to be able to turn on. */
export function sklikWritesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SKLIK_WRITES_ENV] === "1";
}

/** Rail 2 — is this Sklik account's MONEY UNIT settled enough to write a budget to?
 *
 *  A Sklik `dayBudget` is native CZK and S1 writes it as such (no haléře conversion
 *  anywhere in the write path). The risk is not conversion, it is that an account
 *  whose stats look 100× too large may be one where that native-CZK assumption is
 *  wrong — and a budget written under the wrong assumption is off by two orders of
 *  magnitude on a real advertiser's spend. So writes wait for the question to be
 *  answered, either way:
 *
 *   - `halereConfirmed === true` — the owner explicitly settled the unit. Writable.
 *   - `moneyVerdict === "czk-plausible"` — the live sync's own diagnostic says the
 *     spend/budget magnitudes reconcile. Writable.
 *   - `"halere-suspected"` — the open question itself. NOT writable.
 *   - `"insufficient-data"` / absent — never evaluated (a brand-new or empty
 *     account). NOT writable: unknown is not the same as fine, and the fix is one
 *     sync away.
 *
 *  Pure, so all eight verdict × confirmed combinations are pinned as a table. */
export function sklikWritable(
  conn: Pick<SklikConnection, "moneyVerdict" | "halereConfirmed"> | null | undefined
): boolean {
  if (!conn) return false;
  return conn.halereConfirmed === true || conn.moneyVerdict === "czk-plausible";
}

// --- the Sklik transport seam ------------------------------------------------

/** How a write-capable {@link SklikClient} gets its transport. Injectable for
 *  exactly one reason: a unit test must be able to drive the REAL client (so
 *  login-first, the method constants and the status-envelope check are all
 *  exercised) with NO network. Production is always the HTTP transport. */
export type SklikTransportFactory = () => SklikTransport;

const HTTP_TRANSPORT: SklikTransportFactory = () => httpSklikTransport();
let transportFactory: SklikTransportFactory = HTTP_TRANSPORT;

/** Swap the transport a Sklik write client is built on (tests only — production
 *  never calls this). Returns nothing; pair it with {@link resetSklikTransport}. */
export function setSklikTransport(factory: SklikTransportFactory): void {
  transportFactory = factory;
}

/** Restore the real HTTP transport. */
export function resetSklikTransport(): void {
  transportFactory = HTTP_TRANSPORT;
}

/** The ONE place a write-capable Sklik client is constructed. S1b's criterion
 *  mutator must reuse this rather than calling `new SklikClient(...)` itself. */
export function sklikClientFor(token: string): SklikClient {
  return new SklikClient(transportFactory(), token);
}

// --- the two implementations --------------------------------------------------

/** What the Google implementation needs to talk to the API on the user's behalf. */
export interface GoogleActor {
  customerId: string;
  token: string;
}

/** Google Ads mutator — a thin adapter over the EXISTING `@/lib/google/ads`
 *  functions, which are not changed by WP S1 (S3 appends to that module). Every
 *  call below passes exactly the arguments `mutations.ts` passed before the seam
 *  existed, in the same order, so the Google write path is byte-identical. */
export function googleMutator(actor: GoogleActor): AdsMutator {
  return {
    source: "google-ads",
    networkLabel: "Google Ads",
    auditFields: { customerId: actor.customerId },
    pause: (campaignId) => pauseCampaign(actor.token, actor.customerId, campaignId),
    resume: (campaignId) => resumeCampaign(actor.token, actor.customerId, campaignId),
    async readBudgets(ids) {
      const budgets = await fetchCampaignBudgets(actor.token, actor.customerId, ids);
      const out = new Map<string, PlatformBudget>();
      for (const [id, b] of budgets) {
        out.set(id, {
          platform: "google-ads",
          campaignId: b.campaignId,
          budgetResourceName: b.budgetResourceName,
          amountMicros: b.amountMicros,
        });
      }
      return out;
    },
    async setBudget(target, amount) {
      if (target.platform !== "google-ads") {
        throw new Error("Google mutator got a non-Google budget target.");
      }
      await setCampaignBudgetMicros(actor.token, actor.customerId, target.budgetResourceName, amount);
    },
  };
}

/** Sklik mutator — campaign `status` for pause/resume, campaign `dayBudget` (native
 *  CZK) for budget moves. Both go through the isolated method constant (rail 1), so
 *  a wrong RPC name degrades to a failed change-set instead of a corrupted account.
 *  Ids come back to `Number`: `sklik/adapter.ts` stringifies Sklik's numeric ids
 *  into the neutral `Campaign.id`, and the wire wants the number again. A campaign
 *  id that is not numeric is a bug, not a write — it throws before it reaches the
 *  transport. */
export function sklikMutator(client: SklikClient): AdsMutator {
  const numericId = (campaignId: string): number => {
    const n = Number(campaignId);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      throw new Error(`Sklik: neplatné ID kampaně "${campaignId}".`);
    }
    return n;
  };
  return {
    source: "sklik",
    networkLabel: "Sklik",
    auditFields: { platform: "sklik" },
    // `async` on purpose: `numericId` throws, and an AdsMutator method must REJECT
    // rather than throw synchronously — the mutation layer's try/catch wraps an
    // await, and a sync throw from a non-async member would escape it.
    async pause(campaignId) {
      await client.setCampaignStatus(numericId(campaignId), SKLIK_STATUS_SUSPEND);
    },
    async resume(campaignId) {
      await client.setCampaignStatus(numericId(campaignId), SKLIK_STATUS_ACTIVE);
    },
    async readBudgets(ids) {
      const budgets = await client.readCampaignBudgets(ids.map(numericId));
      const out = new Map<string, PlatformBudget>();
      for (const [id, dayBudgetCzk] of budgets) {
        out.set(String(id), { platform: "sklik", campaignId: String(id), dayBudgetCzk });
      }
      return out;
    },
    async setBudget(target, amount) {
      if (target.platform !== "sklik") throw new Error("Sklik mutator got a non-Sklik budget target.");
      await client.setCampaignDayBudget(numericId(target.campaignId), amount);
    },
  };
}

// --- resolution ---------------------------------------------------------------

/** Refusal messages. Each says what the operator can DO next, in Czech, without
 *  naming an env var at a customer. The `sklik-writes-disabled` string is the one
 *  that already shipped (the pre-S1 "Sklik mutations are not supported" refusal) —
 *  kept verbatim, because with the flag off that is still exactly true. */
const REFUSALS: Record<Exclude<MutatorRefusal, "google-not-configured">, string> = {
  "sklik-writes-disabled":
    "Úpravy kampaní pro Sklik zatím nejsou podporované. Dostupné jsou jen pro Google Ads.",
  "sklik-unit-unsettled":
    "Rozpočet do Skliku nezapíšeme, dokud není potvrzená měnová jednotka účtu — zápis by mohl být 100× vedle. Potvrďte jednotku v Nastavení (haléře vs. koruny) nebo účet znovu synchronizujte a zkuste to znovu.",
  "sklik-not-connected": "Nejdřív připojte účet Sklik.",
  "sample-tenant": "Živé úpravy vyžadují připojený reklamní účet.",
};

/** Resolve the mutator for a tenant's writes, or refuse with a typed code.
 *
 *  Replaces the pre-S1 `resolveActor`: same shape (an actor, or a ready-to-return
 *  refusal), same source-first ordering, same three Google messages verbatim. What
 *  is new is that `source === "sklik"` no longer dead-ends — it runs the three rails
 *  and, when all three pass, returns a real Sklik mutator.
 *
 *  Rail order is cheapest-and-most-global first: the off switch decides before any
 *  credential is read, so a deployment with writes off does not even touch the
 *  connection store. */
export async function mutatorForTenant(userId: string, tenant: string): Promise<MutatorResolution> {
  const meta = await getSyncMeta(tenant);

  if (meta?.source === "sklik") {
    // Rail 3 — global off switch (default off).
    if (!sklikWritesEnabled()) {
      return { ok: false, code: "sklik-writes-disabled", error: REFUSALS["sklik-writes-disabled"] };
    }
    const conn = await getSklikConnection(userId);
    if (!conn) {
      return { ok: false, code: "sklik-not-connected", error: REFUSALS["sklik-not-connected"] };
    }
    // Rail 2 — the money unit must be settled before any budget is written.
    if (!sklikWritable(conn)) {
      return { ok: false, code: "sklik-unit-unsettled", error: REFUSALS["sklik-unit-unsettled"] };
    }
    const token = await getSklikToken(userId);
    if (!token) {
      return { ok: false, code: "sklik-not-connected", error: REFUSALS["sklik-not-connected"] };
    }
    return { ok: true, mutator: sklikMutator(sklikClientFor(token)), tenant };
  }

  // Google (and, unchanged from before S1, every non-Sklik tenant including sample):
  // the three guards below, with their exact prior messages.
  if (!adsConfigured()) {
    return {
      ok: false,
      code: "google-not-configured",
      error: "Živé úpravy vyžadují Google Ads developer token.",
    };
  }
  const connection = await getAdsConnection(userId);
  if (!connection) {
    return {
      ok: false,
      code: "google-not-configured",
      error: "Nejdřív připojte živý účet Google Ads.",
    };
  }
  const token = await getUserAccessToken(userId);
  if (!token) {
    return {
      ok: false,
      code: "google-not-configured",
      error: "Chybí autorizace Google (přihlaste se znovu).",
    };
  }
  return { ok: true, mutator: googleMutator({ customerId: connection.customerId, token }), tenant };
}
