/** Social posts: list, create (schedule for later or publish now), delete.
 *  Per-tenant; anonymous visitors get a SESSION-scoped demo tenant (see
 *  api/social/guard.ts) so the flow demos without sign-in — without any
 *  visitor's writes rendering for other visitors. Writes are rate-limited
 *  per user (authed) / per IP (anonymous). Publishing is simulated in demo
 *  mode (see lib/social/publish). */
import { currentUserId } from "@/lib/session";
import { rejectUnknownProject } from "@/lib/projects/api-guard";
import { guardSocialWrite, socialTenant } from "@/app/api/social/guard";
import { SOCIAL_RATE } from "@/lib/social/rails";
import { recordActivity } from "@/lib/campaigns/activity";
import { socialPostActivityRow, socialPostPublishFields } from "@/lib/activity/publish";
import { getServerLocale } from "@/lib/i18n/locale";
import type { SupportedLocale } from "@/lib/format";
import { createPost, deletePost, listPosts, updatePost } from "@/lib/social/store";
import { publishPost, type PublishContext } from "@/lib/social/publish";
import { getAccount, getAccountToken } from "@/lib/social/connection";
import { PLATFORM_LIMITS, isSocialPlatform, type SocialPlatform } from "@/lib/social/types";
import { emitProjectActivity } from "@/lib/activity/emit";
import { channelKeyFromPlatform } from "@/lib/publishing/channel-key";
import { checkCadence } from "@/lib/publishing/cadence";
import { resolveCadenceRules, resolvePublishingCalendar } from "@/lib/publishing/resolve";


const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Tolerance for a scheduled time landing in the past (clock skew / submit latency).
 *  Beyond it, a "scheduled" post is treated as a mistake and rejected rather than
 *  published immediately. */
const PAST_SCHEDULE_SKEW_MS = 2 * 60 * 1000;

/** Resolve the publish context for the signed-in user + platform: the connected account
 *  and — only for a real (non-demo) connection — its decrypted token, so publishPost can
 *  choose the real adapter over an honest simulation. */
async function publishContextFor(platform: SocialPlatform): Promise<PublishContext> {
  const uid = await currentUserId();
  if (!uid) return {};
  const account = await getAccount(uid, platform);
  const token = account && !account.demo ? await getAccountToken(uid, platform) : null;
  return { account, token };
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  const uid = await currentUserId();
  const unknown = await rejectUnknownProject(uid, projectId);
  if (unknown) return unknown;
  return Response.json({ posts: await listPosts(await socialTenant(uid, projectId)) });
}

/** THE cadence chokepoint. Every scheduler in the app — the week planner, the
 *  content-plan board's hand-off, the distribution variant card — creates its
 *  scheduled post here, which is the only reason a cap written once in the kanály
 *  wizard can bind all three without any of them knowing about it.
 *
 *  Returns the 409 body when the post would break the operator's own "max n×
 *  týdně" promise, or null when it may go ahead. Fails OPEN by construction: no
 *  tracked cap for the platform's channel ⇒ zero extra reads and an unchanged
 *  response (the byte-identity pin in test-unit/social-posts-cadence.test.mjs),
 *  and an unreadable kanály store enforces nothing rather than refusing a post the
 *  operator is entitled to make.
 *
 *  The override is a HUMAN CLICK, never an inference: the client re-posts with
 *  `overrideCadence: true` after being shown the cap it is about to break, and
 *  that decision is written to the audit timeline. Nothing auto-reschedules. */
async function cadenceRefusal(
  uid: string | null,
  projectId: string | null,
  platform: SocialPlatform,
  scheduledAt: string,
  override: boolean,
  locale: SupportedLocale
): Promise<Response | null> {
  // Anonymous demo writes have no project, so no tracked channels and no caps.
  if (!uid || !projectId) return null;
  const rules = await resolveCadenceRules(projectId);
  if (rules.length === 0) return null;
  const channel = channelKeyFromPlatform(platform);
  // Same tenant/keys the route itself resolves — the resolver reads through the
  // stores' own dispatchers, deduped per request with React cache().
  const { items } = await resolvePublishingCalendar(uid, projectId);
  const check = checkCadence(items, channel, scheduledAt, rules);
  if (!check.exceeded) return null;
  if (!override) {
    return Response.json(
      {
        error: "cadence-exceeded",
        channel: check.channel,
        cap: check.cap,
        count: check.count,
        weekStart: check.weekStart,
      },
      { status: 409 }
    );
  }
  // Overridden: the post is created, and the exception is on the record. Written
  // against the module that OWNS the cap (kanaly), not the one that broke it, so
  // the audit sits next to the promise it overrode. The prose is persisted, so it
  // is written in the language of the person who clicked — same rule as the
  // scheduling row below.
  await emitProjectActivity(uid, projectId, {
    kind: "update",
    module: "kanaly",
    severity: "warning",
    title: locale === "en" ? "Cadence cap overridden" : "Limit kadence ručně překročen",
    detail: `${check.channel} · ${check.count + 1}/${check.cap} (${check.weekStart})`,
    actor: "Vy",
  });
  return null;
}

export async function POST(request: Request) {
  let body: {
    platform?: unknown;
    content?: unknown;
    scheduledAt?: unknown;
    projectId?: unknown;
    overrideCadence?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const platform = body.platform;
  if (!isSocialPlatform(platform)) return Response.json({ error: "Neplatná platforma." }, { status: 422 });
  const content = str(body.content);
  if (content.length < 2) return Response.json({ error: "Příspěvek je prázdný." }, { status: 422 });
  if (content.length > PLATFORM_LIMITS[platform]) {
    return Response.json(
      { error: `Příspěvek překračuje limit ${PLATFORM_LIMITS[platform]} znaků.` },
      { status: 422 }
    );
  }

  const projectId = str(body.projectId) || null;
  const uid = await currentUserId();
  const unknown = await rejectUnknownProject(uid, projectId);
  if (unknown) return unknown;
  // Write rail: per-user when signed in, durable per-IP for the anonymous demo.
  const limited = await guardSocialWrite(request, uid, SOCIAL_RATE.postPerMin());
  if (limited) return limited;
  const tenant = await socialTenant(uid, projectId);
  // The activity row's prose is persisted, so it is written in the language of the
  // person who triggered it. The structured publish taxonomy below is unaffected.
  const locale = await getServerLocale();
  const rawScheduledAt = str(body.scheduledAt);
  // Parse to an instant and store the CANONICAL UTC ISO, so the cron's UTC "due"
  // comparison is always against a UTC value. Reject a non-empty but unparseable
  // value instead of silently falling through to publish-now (NaN > now is false).
  const scheduledMs = rawScheduledAt ? Date.parse(rawScheduledAt) : NaN;
  if (rawScheduledAt && Number.isNaN(scheduledMs)) {
    return Response.json({ error: "Neplatné datum plánování." }, { status: 422 });
  }
  const scheduledAt = Number.isNaN(scheduledMs) ? "" : new Date(scheduledMs).toISOString();
  // "Schedule for a past time" and "publish now" are different user intents. A supplied
  // timestamp more than a small skew window in the past (a year typo, a stale form value,
  // a timezone misread) must NOT silently fall through to the publish-now branch and go
  // out live on a connected account — the most irreversible action here. Reject it; only
  // an OMITTED scheduledAt means publish now.
  if (scheduledAt !== "" && scheduledMs < Date.now() - PAST_SCHEDULE_SKEW_MS) {
    return Response.json({ error: "Naplánovaný čas je v minulosti." }, { status: 422 });
  }
  const future = scheduledAt !== "" && scheduledMs > Date.now();

  // Schedule for later → the cron publishes it when due.
  if (future) {
    const refused = await cadenceRefusal(uid, projectId, platform, scheduledAt, body.overrideCadence === true, locale);
    if (refused) return refused;
    const post = await createPost(tenant, { platform, content, status: "scheduled", scheduledAt });
    // Scheduling is a promise about the future — nothing has left the app yet, so
    // this row must NOT read as (or be counted as) a publish. The cron records the
    // publish event when it actually sends the post.
    await recordActivity(tenant, {
      kind: "update", module: "socialni", severity: "info",
      title: socialPostActivityRow("scheduled", locale).title, detail: platform, actor: "Vy",
      // No publish taxonomy: socialPostActivityRow("scheduled").publish is false,
      // so this row stays invisible to the publish-rate rollup.
      ...socialPostPublishFields("scheduled"),
    });
    return Response.json({ post });
  }

  // Publish now — real when a provider is configured + the account is connected with a
  // token, an honest simulation otherwise (marked simulated on the record).
  const post = await createPost(tenant, { platform, content, status: "draft" });
  const result = await publishPost(platform, content, post.id, await publishContextFor(platform));
  const patch = result.ok
    ? {
        status: "published" as const,
        publishedAt: new Date().toISOString(),
        externalUrl: result.externalUrl,
        simulated: result.simulated,
        // WP W3-D: keep the PLATFORM's own post id, not just the permalink — it is the
        // handle the read-back cron reads engagement with. Only present on a real
        // publish; spread so a simulated one writes no empty field.
        ...(result.externalId ? { externalId: result.externalId } : {}),
      }
    : { status: "failed" as const, error: result.error ?? "Publikování se nezdařilo.", simulated: result.simulated };
  await updatePost(tenant, post.id, patch);
  // Publish-now: success IS the moment the content left for the channel, so this
  // row carries the publish taxonomy. A FAILED publish keeps the plain failure
  // title — nothing left the app, so it must not read as a publish event.
  await recordActivity(tenant, {
    kind: "update", module: "socialni", severity: result.ok ? "success" : "warning",
    title: socialPostActivityRow(result.ok ? "published" : "failed", locale).title,
    detail: platform, actor: "Vy",
    // Only the successful branch carries the taxonomy — a failed publish left
    // nothing behind and must not be counted. The simulated tag rides the same
    // row so the publish-rate rollup can split demo sends from live confirms.
    ...socialPostPublishFields(result.ok ? "published" : "failed", { simulated: result.simulated }),
  });
  return Response.json({ post: { ...post, ...patch } });
}

export async function DELETE(request: Request) {
  let id = "";
  let projectId: string | null = null;
  try {
    const body = (await request.json()) as { id?: unknown; projectId?: unknown };
    id = str(body.id);
    projectId = str(body.projectId) || null;
  } catch {
    /* fall through */
  }
  if (!id) return Response.json({ error: "Chybí ID." }, { status: 422 });
  const uid = await currentUserId();
  const unknown = await rejectUnknownProject(uid, projectId);
  if (unknown) return unknown;
  // Same write rail as POST — a delete is a store write too.
  const limited = await guardSocialWrite(request, uid, SOCIAL_RATE.postPerMin());
  if (limited) return limited;
  const ok = await deletePost(await socialTenant(uid, projectId), id);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
