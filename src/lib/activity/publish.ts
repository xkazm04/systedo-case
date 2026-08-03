/** The "an AI-generated asset actually left the app" event — the completion half
 *  of the generate loop, and the only seam that answers "does generated output get
 *  used, or does it die in the panel?".
 *
 *  Generation is already recorded (LLM telemetry, keyed by projectId + at). Export
 *  and copy were not recorded anywhere, so the publish rate could not be computed
 *  from either side. The push-to-channel path (social posts, microsite) DOES emit
 *  activity already; this covers the export/copy paths that did not.
 *
 *  Framework-free and server-free on purpose: the API route validates against this
 *  union and the client helper imports the same one, so a new asset kind cannot be
 *  added on one side only. `src/lib/export.ts` and `src/lib/clipboard.ts` stay pure
 *  DOM helpers — instrumenting inside them would break the contract that lets any
 *  client component import them. */

/** What kind of AI-generated asset left the app. Additive: an unknown value from an
 *  older client is rejected at the route boundary rather than stored, so the feed
 *  never carries a kind the reader can't label. */
export const PUBLISH_ASSET_KINDS = [
  "ad_copy",
  "article",
  "content_brief",
  "keyword_list",
  "analysis",
  "social_post",
  "newsletter",
] as const;

export type PublishAssetKind = (typeof PUBLISH_ASSET_KINDS)[number];

export function isPublishAssetKind(v: unknown): v is PublishAssetKind {
  return typeof v === "string" && (PUBLISH_ASSET_KINDS as readonly string[]).includes(v);
}

/** How the asset left — an export (file download), a clipboard copy, or a push
 *  straight into a connected channel (the social center's scheduled/published
 *  post). Kept separate from the kind so the publish rate can be read overall or
 *  per route out of the app.
 *
 *  `channel` is the only via NOT reported by the client beacon: it is written
 *  server-side by the route that creates the post, because that is the moment the
 *  content actually leaves — and one writer means one row per user action. */
export const PUBLISH_VIAS = ["export", "copy", "channel"] as const;

export type PublishVia = (typeof PUBLISH_VIAS)[number];

export function isPublishVia(v: unknown): v is PublishVia {
  return typeof v === "string" && (PUBLISH_VIAS as readonly string[]).includes(v);
}

/** cs-CZ labels for the activity timeline. The feed is a human-readable audit
 *  surface, so the row has to read as a sentence, not as an enum pair. */
const KIND_LABELS: Record<PublishAssetKind, string> = {
  ad_copy: "Inzerátní texty",
  article: "Článek",
  content_brief: "Obsahový brief",
  keyword_list: "Seznam klíčových slov",
  analysis: "Analýza výkonu",
  social_post: "Příspěvek na sociální sítě",
  newsletter: "Newsletter",
};

const VIA_LABELS: Record<PublishVia, string> = {
  export: "staženo",
  copy: "zkopírováno",
  channel: "odesláno do kanálu",
};

/** The timeline row for one publish event: "Článek — zkopírováno z aplikace". */
export function publishActivityTitle(kind: PublishAssetKind, via: PublishVia): string {
  return `${KIND_LABELS[kind]} — ${VIA_LABELS[via]}`;
}

const VIA_VERBS: Record<PublishVia, string> = {
  export: "stažen do souboru",
  copy: "zkopírován do schránky",
  channel: "odeslán do napojeného kanálu",
};

export function publishActivityDetail(kind: PublishAssetKind, via: PublishVia): string {
  return `Vygenerovaný výstup (${KIND_LABELS[kind].toLowerCase()}) byl ${VIA_VERBS[via]}.`;
}
