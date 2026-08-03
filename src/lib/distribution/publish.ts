/** Which publish event each "content leaves the app" action in Distribuce reports
 *  — and, just as importantly, which one deliberately reports NOTHING from the
 *  client because the server already records it.
 *
 *  Distribuce is the context whose entire purpose is getting content out of the
 *  app, yet it recorded nothing: copy-text, copy-link and the newsletter
 *  copy/download were pure clipboard/Blob calls, and the social handoff produced
 *  only the social center's generic "Příspěvek naplánován" row. This table is the
 *  single place that says what each action means in the shared
 *  {@link import("@/lib/activity/publish").PublishAssetKind} taxonomy, so the
 *  component stays a thin caller and the mapping is unit-testable without a DOM.
 *
 *  Exactly ONE event per shipped asset: the copy/download actions are reported by
 *  the client beacon (the browser is the only place that knows they happened);
 *  the social handoff is reported server-side, at the moment the post actually
 *  goes out to the channel — the cron for a scheduled post, `POST
 *  /api/social/posts` for a publish-now. The handoff therefore returns `null`
 *  here: beaconing at click time would count a publish that has not happened
 *  yet, and would count it twice once it does. */
import type { PublishAssetKind, PublishVia } from "@/lib/activity/publish";
import type { RepurposeChannel } from "./generate";

/** Compile-time tie to the repurpose channel set: renaming the channel in
 *  generate.ts breaks this line rather than silently mislabelling newsletters. */
export const NEWSLETTER_CHANNEL = "Newsletter" satisfies RepurposeChannel;

/** The distinct ways content leaves Distribuce. */
export type DistributionAction =
  | "copyVariant"
  | "copyLink"
  | "copyNewsletter"
  | "downloadNewsletter"
  | "scheduleToSocial";

export interface DistributionPublishEvent {
  kind: PublishAssetKind;
  via: PublishVia;
}

/** What a channel variant IS once it leaves: the Newsletter variant becomes an
 *  email, every other channel becomes a social post. */
export function variantPublishKind(channel: string): PublishAssetKind {
  return channel === NEWSLETTER_CHANNEL ? "newsletter" : "social_post";
}

/** The event the client should beacon for `action` on `channel`, or `null` when
 *  the event is recorded server-side instead. */
export function distributionPublishEvent(
  action: DistributionAction,
  channel: string
): DistributionPublishEvent | null {
  switch (action) {
    // The variant text and its UTM-stamped link are the two halves of the same
    // shipped asset — both are the channel's post leaving on the clipboard.
    case "copyVariant":
    case "copyLink":
      return { kind: variantPublishKind(channel), via: "copy" };
    case "copyNewsletter":
      return { kind: "newsletter", via: "copy" };
    case "downloadNewsletter":
      return { kind: "newsletter", via: "export" };
    // Recorded server-side as `social_post`/`channel` when the post actually goes
    // out (the cron, or the publish-now route). Scheduling it is only a promise,
    // so there is nothing to beacon here → no early and no double count.
    case "scheduleToSocial":
      return null;
  }
}
