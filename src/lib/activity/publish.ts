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

import type { SupportedLocale } from "@/lib/format";

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

/** Labels for the activity timeline. The feed is a human-readable audit surface,
 *  so the row has to read as a sentence, not as an enum pair.
 *
 *  The composed row text is PERSISTED, so the language is fixed at write time —
 *  the writer passes the reader's locale (`getServerLocale()` on the click paths,
 *  `HOME_MARKET_LOCALE` on the cron, which has no reader). The structured
 *  `publishKind`/`publishVia` fields, not this prose, are what the publish-rate
 *  rollup counts, so localizing the timeline cannot move the measure. */
const KIND_LABELS: Record<SupportedLocale, Record<PublishAssetKind, string>> = {
  cs: {
    ad_copy: "Inzerátní texty",
    article: "Článek",
    content_brief: "Obsahový brief",
    keyword_list: "Seznam klíčových slov",
    analysis: "Analýza výkonu",
    social_post: "Příspěvek na sociální sítě",
    newsletter: "Newsletter",
  },
  en: {
    ad_copy: "Ad copy",
    article: "Article",
    content_brief: "Content brief",
    keyword_list: "Keyword list",
    analysis: "Performance analysis",
    social_post: "Social post",
    newsletter: "Newsletter",
  },
};

const VIA_LABELS: Record<SupportedLocale, Record<PublishVia, string>> = {
  cs: {
    export: "staženo",
    copy: "zkopírováno",
    channel: "odesláno do kanálu",
  },
  en: {
    export: "downloaded",
    copy: "copied",
    channel: "sent to a channel",
  },
};

/** The asset-kind label in one locale — the feed's own vocabulary for a kind. */
export function publishKindLabel(kind: PublishAssetKind, locale: SupportedLocale): string {
  return (KIND_LABELS[locale] ?? KIND_LABELS.en)[kind];
}

/** The timeline row for one publish event: "Článek — zkopírováno". */
export function publishActivityTitle(
  kind: PublishAssetKind,
  via: PublishVia,
  locale: SupportedLocale
): string {
  return `${publishKindLabel(kind, locale)} — ${(VIA_LABELS[locale] ?? VIA_LABELS.en)[via]}`;
}

const VIA_VERBS: Record<SupportedLocale, Record<PublishVia, string>> = {
  cs: {
    export: "stažen do souboru",
    copy: "zkopírován do schránky",
    channel: "odeslán do napojeného kanálu",
  },
  en: {
    export: "downloaded to a file",
    copy: "copied to the clipboard",
    channel: "sent to a connected channel",
  },
};

export function publishActivityDetail(
  kind: PublishAssetKind,
  via: PublishVia,
  locale: SupportedLocale
): string {
  const kindText = publishKindLabel(kind, locale).toLowerCase();
  const verb = (VIA_VERBS[locale] ?? VIA_VERBS.en)[via];
  return locale === "en"
    ? `Generated output (${kindText}) was ${verb}.`
    : `Vygenerovaný výstup (${kindText}) byl ${verb}.`;
}

// --- social post lifecycle ---------------------------------------------------

/** What happened to a social post at the moment its activity row is written.
 *  `scheduled` is a promise about the future; only `published` means the content
 *  actually went out to the channel. */
export type SocialPostOutcome = "scheduled" | "published" | "failed";

/** The activity row one social-post lifecycle transition produces, and whether it
 *  counts as a publish.
 *
 *  This exists because the publish event is easy to record at the wrong moment.
 *  A post scheduled for next Tuesday has left nothing; if its row carried the
 *  publish title, the publish rate would count it immediately AND count it again
 *  — or, worse, keep counting it after the cron's attempt failed. So exactly one
 *  outcome is a publish event, it is the one the cron writes when the provider
 *  confirms, and both the manual route and the cron derive their row from here
 *  rather than each spelling the title out. */
const LIFECYCLE_TITLES: Record<SupportedLocale, { scheduled: string; failed: string }> = {
  cs: { scheduled: "Příspěvek naplánován", failed: "Publikování příspěvku selhalo" },
  en: { scheduled: "Post scheduled", failed: "Post publishing failed" },
};

export function socialPostActivityRow(
  outcome: SocialPostOutcome,
  locale: SupportedLocale
): {
  title: string;
  /** True only when this row IS an asset-publish event (kind `social_post`,
   *  via `channel`) and may be counted as one by the publish-rate rollup. */
  publish: boolean;
} {
  const titles = LIFECYCLE_TITLES[locale] ?? LIFECYCLE_TITLES.en;
  switch (outcome) {
    case "published":
      return { title: publishActivityTitle("social_post", "channel", locale), publish: true };
    case "scheduled":
      // A scheduling promise, not a publish — the cron records the real event.
      return { title: titles.scheduled, publish: false };
    case "failed":
      return { title: titles.failed, publish: false };
  }
}

/** The structured `{publishKind, publishVia}` fields a social-post lifecycle row
 *  carries — populated ONLY for the outcome that is a real publish, empty for the
 *  scheduling promise and the failure. Spread into the ActivityInput so the two
 *  writers (the publish-now route and the cron) cannot disagree about which rows
 *  the publish-rate rollup is allowed to count:
 *
 *      recordActivity(tenant, { …, title: row.title, ...socialPostPublishFields(o) })
 */
export function socialPostPublishFields(
  outcome: SocialPostOutcome
): { publishKind: PublishAssetKind; publishVia: PublishVia } | Record<string, never> {
  // Locale-independent by construction: only the `publish` bit is read here, and
  // the title is the row's only locale-sensitive half — so any locale answers.
  return socialPostActivityRow(outcome, "cs").publish
    ? { publishKind: "social_post", publishVia: "channel" }
    : {};
}
