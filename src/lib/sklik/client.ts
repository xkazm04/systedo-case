/** Minimal typed client for the Sklik API (Seznam's Czech ad platform).
 *
 *  Sklik exposes a JSON interface at https://api.sklik.cz/drak/json/ where each
 *  method is POSTed as `/{namespace.method}` with a JSON array of positional
 *  arguments; the response is a JSON object carrying `status` / `statusMessage`
 *  plus the method's payload and a rolling `session` token. Auth is a two-step
 *  handshake: `client.loginByToken(token)` returns a session, which is then
 *  threaded through every subsequent call as the `{ session }` user struct (and
 *  refreshed from each response).
 *
 *  The transport is INJECTABLE so the adapter can be unit-tested against a fixture
 *  with no network. Dependency-free (fetch only); the real HTTP transport is the
 *  only part that touches the network. */
import type { SklikCampaign, SklikKeywordSuggestion, SklikStatsReport } from "./types";

/** How a client call reaches Sklik — a single seam so tests swap in a fixture. */
export interface SklikTransport {
  /** Invoke `method` (e.g. "campaigns.list") with positional `params`; resolve
   *  the decoded JSON object. Implementations MUST throw on transport failure. */
  call(method: string, params: unknown[]): Promise<Record<string, unknown>>;
}

/** Sklik's public JSON endpoint. */
export const SKLIK_API_BASE = "https://api.sklik.cz/drak/json";

/** A Sklik failure carrying a numeric status, so the connector's live-retry can
 *  classify it. `classifyLiveError` (google/ads.ts) is deliberately
 *  provider-neutral — it reads `.status` off ANY thrown value — but the Sklik
 *  transport used to throw plain Errors with the status only interpolated into the
 *  message, so every Sklik failure fell through to "permanent". A Sklik 503 or a
 *  rate-limit therefore degraded the sync to sample data immediately, while the
 *  identical Google failure backed off and retried once.
 *
 *  Carries Sklik's own envelope status when the transport-level HTTP call
 *  succeeded (Sklik answers 200 with a `status` field), and the HTTP status
 *  otherwise; both use the same HTTP-shaped codes, which is what the classifier
 *  expects. A Sklik 401 classifies as "token" and the connector degrades at once —
 *  correct, since there is no Sklik token refresher to retry with. */
export class SklikApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SklikApiError";
    this.status = status;
  }
}

/** The real network transport: POST the positional args as a JSON array and
 *  surface Sklik's own status envelope as errors (status ≥ 300 → throw), so the
 *  connector's degrade-to-sample wrapper treats an API-level failure exactly like
 *  a network one. */
export function httpSklikTransport(baseUrl: string = SKLIK_API_BASE): SklikTransport {
  return {
    async call(method, params) {
      const res = await fetch(`${baseUrl}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        throw new SklikApiError(
          res.status,
          `Sklik ${method} HTTP ${res.status}: ${await res.text().catch(() => "")}`
        );
      }
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const status = typeof json.status === "number" ? json.status : 200;
      // Sklik uses HTTP 200 with a status field; 200/201 are OK, ≥300 is an error.
      if (status >= 300) {
        const msg = typeof json.statusMessage === "string" ? json.statusMessage : "";
        throw new SklikApiError(status, `Sklik ${method} status ${status}: ${msg}`);
      }
      return json;
    },
  };
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
}

/** The Sklik JSON-RPC method used to fetch keyword suggestions for a seed phrase.
 *  ISOLATED as a single constant (the moneyToCzk precedent): Sklik's public drak API
 *  keyword surface is not stably documented offline, so the method name AND the response
 *  mapping (sklik/keywords.ts `mapSklikSuggestion`) are the one place to adjust once
 *  verified against a live account. `keywords.suggest` is the documented-plausible RPC;
 *  an unknown method simply throws and the connector degrades to no Sklik contribution. */
export const SKLIK_KEYWORDS_METHOD = "keywords.suggest";

/** WP S1 rail 1 — the WRITE method, isolated exactly like {@link SKLIK_KEYWORDS_METHOD}
 *  and for the same reason, only with real money behind it.
 *
 *  Sklik's drak API is not stably documented offline, so the one thing this repo
 *  cannot prove without a live account is the method NAME. Keeping it (and the two
 *  status literals below) as isolated constants means a wrong guess DEGRADES rather
 *  than corrupts: the transport throws `Sklik campaigns.update …`, the mutation
 *  returns `{ ok: false, error }`, the change-set settles `failed`, and nothing else
 *  in the set moves. Fixing a name is a one-line edit here, never a hunt through the
 *  mutation path. `campaigns.update` is the documented-plausible RPC; it takes the
 *  `{ session }` user struct and an ARRAY of partial campaign structs, each keyed by
 *  its numeric `id`:
 *
 *    [ { session }, [ { id: 42, dayBudget: 250 } ] ]   // budget write (native CZK)
 *    [ { session }, [ { id: 42, status: "suspend" } ] ] // status write
 *
 *  See docs/deploy.md § "Sklik writes" for the manual live proof that settles the
 *  name before `SKLIK_WRITES_ENABLED` is turned on anywhere real. */
export const SKLIK_CAMPAIGN_UPDATE_METHOD = "campaigns.update";

/** Serving status literals for {@link SKLIK_CAMPAIGN_UPDATE_METHOD}. Isolated with
 *  the method for the same degrade-not-corrupt reason, and mirrored by the read-side
 *  mapping in `sklik/adapter.ts` (`sklikStatus`: "active" → enabled, everything else
 *  → paused), so a rename has exactly two places to touch. */
export const SKLIK_STATUS_ACTIVE = "active";
export const SKLIK_STATUS_SUSPEND = "suspend";

/** The serving statuses a write may set — the only two the control plane ever asks
 *  for (pause / resume). */
export type SklikWritableStatus = typeof SKLIK_STATUS_ACTIVE | typeof SKLIK_STATUS_SUSPEND;

/** Stats granularity Sklik supports for a report. */
export type SklikGranularity = "total" | "daily";

export interface SklikStatsParams {
  /** limit to these campaign ids; omitted → the whole account */
  campaignIds?: number[];
  /** YYYY-MM-DD inclusive */
  dateFrom: string;
  /** YYYY-MM-DD inclusive */
  dateTo: string;
  granularity: SklikGranularity;
}

/** A thin, session-managing wrapper over a {@link SklikTransport}. One instance
 *  per sync — it logs in lazily on first use and reuses / refreshes the session
 *  across calls. */
export class SklikClient {
  private session: string | null = null;
  private readonly transport: SklikTransport;
  private readonly token: string;

  constructor(transport: SklikTransport, token: string) {
    this.transport = transport;
    this.token = token;
  }

  /** Lazily authenticate; cache the session for the rest of this instance's life. */
  private async login(): Promise<string> {
    if (this.session) return this.session;
    const res = await this.transport.call("client.loginByToken", [this.token]);
    const session = res.session;
    if (typeof session !== "string" || !session) {
      throw new Error("Sklik login failed: no session returned");
    }
    this.session = session;
    return session;
  }

  /** The `{ session }` user struct every authenticated method takes as arg 0. */
  private async user(): Promise<{ session: string }> {
    return { session: await this.login() };
  }

  /** Sklik rotates the session on each response; keep the freshest one. */
  private refresh(res: Record<string, unknown>): void {
    if (typeof res.session === "string" && res.session) this.session = res.session;
  }

  /** Re-assert Sklik's own status envelope on a WRITE response.
   *
   *  {@link httpSklikTransport} already throws on `status >= 300`, so on the real
   *  wire this is redundant — deliberately. A write is the one call where "the
   *  transport was supposed to check" is not good enough: any other transport (a
   *  fixture, a future retrying/caching one) that returns an error envelope instead
   *  of throwing must NOT be able to make a failed mutation look like a landed one.
   *  The read paths keep their tolerant "map whatever came back" contract. */
  private assertWriteOk(res: Record<string, unknown>, method: string): void {
    const status = typeof res.status === "number" ? res.status : 200;
    if (status >= 300) {
      const msg = typeof res.statusMessage === "string" ? res.statusMessage : "";
      throw new SklikApiError(status, `Sklik ${method} status ${status}: ${msg}`);
    }
  }

  /** WP S1 — set a campaign's DAILY BUDGET, in native CZK (Sklik money fields carry
   *  no micros; see SklikCampaign.dayBudget). Rounded to a whole koruna because
   *  `dayBudget` is an integer cap. Logs in first (via {@link user}), asserts Sklik's
   *  own status envelope, then adopts the rotated session. */
  async setCampaignDayBudget(campaignId: number, dayBudgetCzk: number): Promise<void> {
    const user = await this.user();
    const res = await this.transport.call(SKLIK_CAMPAIGN_UPDATE_METHOD, [
      user,
      [{ id: campaignId, dayBudget: Math.round(dayBudgetCzk) }],
    ]);
    this.assertWriteOk(res, SKLIK_CAMPAIGN_UPDATE_METHOD);
    this.refresh(res);
  }

  /** WP S1 — set a campaign's serving status ({@link SKLIK_STATUS_ACTIVE} /
   *  {@link SKLIK_STATUS_SUSPEND}) — the Sklik half of pause / resume. */
  async setCampaignStatus(campaignId: number, status: SklikWritableStatus): Promise<void> {
    const user = await this.user();
    const res = await this.transport.call(SKLIK_CAMPAIGN_UPDATE_METHOD, [
      user,
      [{ id: campaignId, status }],
    ]);
    this.assertWriteOk(res, SKLIK_CAMPAIGN_UPDATE_METHOD);
    this.refresh(res);
  }

  /** WP S1 — current daily budgets (native CZK) for specific campaigns: the Sklik
   *  counterpart of Google's `fetchCampaignBudgets`, and the read a budget shift does
   *  BEFORE it writes. Deliberately reuses {@link listCampaigns} (the already-proven
   *  `campaigns.list` + `dayBudget` column) rather than introducing a second read
   *  method — one account-wide list, then a local filter, so a write path adds no new
   *  unverifiable method name. Campaigns without a stored `dayBudget` are absent from
   *  the map (the caller refuses rather than guessing a budget). */
  async readCampaignBudgets(campaignIds: number[]): Promise<Map<number, number>> {
    const wanted = new Set(campaignIds);
    const out = new Map<number, number>();
    if (wanted.size === 0) return out;
    for (const c of await this.listCampaigns()) {
      if (wanted.has(c.id) && c.dayBudget != null) out.set(c.id, c.dayBudget);
    }
    return out;
  }

  /** Every non-deleted campaign in the account (id, name, status, type, budget). */
  async listCampaigns(): Promise<SklikCampaign[]> {
    const user = await this.user();
    const res = await this.transport.call("campaigns.list", [
      user,
      {},
      { displayColumns: ["id", "name", "status", "type", "dayBudget", "deleted"] },
    ]);
    this.refresh(res);
    const raw = Array.isArray(res.campaigns) ? (res.campaigns as unknown[]) : [];
    return raw
      .map((c) => c as Record<string, unknown>)
      .filter((c) => c.deleted !== true && c.id != null)
      .map((c) => ({
        id: num(c.id),
        name: typeof c.name === "string" ? c.name : undefined,
        status: typeof c.status === "string" ? c.status : undefined,
        type: typeof c.type === "string" ? c.type : undefined,
        dayBudget: c.dayBudget != null ? num(c.dayBudget) : undefined,
        deleted: c.deleted === true,
      }));
  }

  /** Keyword suggestions for a seed phrase, from Sklik's keyword surface
   *  (SKLIK_KEYWORDS_METHOD). Returns the raw wire suggestions; the neutral mapping into
   *  RawKeywordIdea lives in sklik/keywords.ts (the documented seam). The response
   *  envelope is read defensively (either `suggestions` or `keywords` array), since the
   *  exact key is offline-unverifiable. An empty / unrecognised response → []. */
  async suggestKeywords(seed: string, limit = 40): Promise<SklikKeywordSuggestion[]> {
    const user = await this.user();
    const res = await this.transport.call(SKLIK_KEYWORDS_METHOD, [user, { seed, limit }]);
    this.refresh(res);
    const raw = Array.isArray(res.suggestions)
      ? (res.suggestions as unknown[])
      : Array.isArray(res.keywords)
        ? (res.keywords as unknown[])
        : [];
    return raw.map((s) => {
      const o = s as Record<string, unknown>;
      const out: SklikKeywordSuggestion = {};
      if (typeof o.keyword === "string") out.keyword = o.keyword;
      if (o.searchCount != null) out.searchCount = num(o.searchCount);
      if (o.avgCpc != null) out.avgCpc = num(o.avgCpc);
      if (o.competition != null) out.competition = num(o.competition);
      return out;
    });
  }

  /** Per-campaign performance over a window. `granularity: "daily"` yields one
   *  {@link SklikStatRow} per campaign per day (the trend series); "total" yields
   *  a single aggregate row per campaign (the table snapshot). */
  async campaignStats(params: SklikStatsParams): Promise<SklikStatsReport[]> {
    const user = await this.user();
    const res = await this.transport.call("stats.campaigns", [
      user,
      {
        ...(params.campaignIds ? { campaignIds: params.campaignIds } : {}),
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        granularity: params.granularity,
      },
    ]);
    this.refresh(res);
    const report = Array.isArray(res.report) ? (res.report as unknown[]) : [];
    return report
      .map((r) => r as Record<string, unknown>)
      .filter((r) => r.campaignId != null)
      .map((r) => ({
        campaignId: num(r.campaignId),
        stats: Array.isArray(r.stats)
          ? (r.stats as unknown[]).map((s) => {
              const row = s as Record<string, unknown>;
              return {
                ...(typeof row.date === "string" ? { date: row.date } : {}),
                impressions: num(row.impressions),
                clicks: num(row.clicks),
                money: num(row.money),
                conversions: num(row.conversions),
                conversionValue: num(row.conversionValue),
              };
            })
          : [],
      }));
  }
}
