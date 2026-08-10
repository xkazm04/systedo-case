/** Record one Distribuce action in the shared asset-publish audit trail — the same
 *  taxonomy the AI panels use, so the publish rate counts this context too. Actions
 *  the server already records (the social handoff) map to no event and are silently
 *  skipped here; see lib/distribution/publish.ts. Fire-and-forget by contract: the
 *  copy/download must never fail because the audit write did.
 *
 *  Shared by the variant card and the newsletter handoff, which is why it lives
 *  beside them rather than inside either. */
import { reportAssetPublished } from "@/lib/activity/publish-client";
import { distributionPublishEvent, type DistributionAction } from "@/lib/distribution/publish";

export function reportDistributionPublish(
  action: DistributionAction,
  channel: string,
  projectId?: string | null
): void {
  const event = distributionPublishEvent(action, channel);
  if (event) reportAssetPublished(event.kind, event.via, projectId);
}
