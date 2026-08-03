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
 *  Exactly ONE event per user action: the copy/download actions are reported by
 *  the client beacon (the browser is the only place that knows they happened);
 *  the social handoff is reported by `POST /api/social/posts`, which is where the
 *  post is actually created. The handoff therefore returns `null` here — a beacon
 *  as well would double-count the same publish. */
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
    // Recorded by POST /api/social/posts as `social_post`/`channel`, at the
    // moment the post row is created. No client beacon → no double count.
    case "scheduleToSocial":
      return null;
  }
}
