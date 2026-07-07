/** Saved keyword lists for the signed-in user's tenant:
 *   GET    → all lists + aggregated negatives
 *   POST   → save a new list {name, seed, source, keywords}
 *   PATCH  → re-tag keywords in a list {id, tags}
 *   DELETE → remove a list {id}
 *  Saving requires an account (anonymous research stays transient). Node runtime. */
import { auth } from "@/auth";
import { resolveTenant } from "@/lib/campaigns/connector";
import { recordActivity } from "@/lib/campaigns/activity";
import {
  saveKeywordList,
  listKeywordLists,
  updateKeywordTags,
  deleteKeywordList,
} from "@/lib/keywords/store";
import { aggregateNegatives, type KeywordTag, type SavedKeyword } from "@/lib/keywords/types";


async function requireUserId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

const TAGS: KeywordTag[] = ["core", "negative", "watch"];
const isTag = (v: unknown): v is KeywordTag => typeof v === "string" && TAGS.includes(v as KeywordTag);

/** Coerce untrusted JSON into a SavedKeyword, clamping numbers and defaulting tag. */
function toSavedKeyword(raw: unknown): SavedKeyword | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const keyword = typeof r.keyword === "string" ? r.keyword.trim() : "";
  if (!keyword) return null;
  const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const intent = r.intent === "transactional" || r.intent === "brand" ? r.intent : "informational";
  const competition = r.competition === "low" || r.competition === "high" ? r.competition : "medium";
  return {
    keyword,
    intent,
    competition,
    opportunity: Math.max(0, Math.min(100, Math.round(num(r.opportunity)))),
    avgMonthlySearches: Math.max(0, Math.round(num(r.avgMonthlySearches))),
    tag: isTag(r.tag) ? r.tag : "watch",
  };
}

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ lists: [], negatives: [] });
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const tenant = await resolveTenant(userId, projectId);
  const lists = await listKeywordLists(tenant);
  return Response.json({ lists, negatives: aggregateNegatives(lists) });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Pro uložení seznamu se přihlaste." }, { status: 401 });

  let body: { name?: unknown; seed?: unknown; source?: unknown; keywords?: unknown; projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const seed = typeof body.seed === "string" ? body.seed.trim() : "";
  const name = (typeof body.name === "string" && body.name.trim()) || seed || "Bez názvu";
  const source = body.source === "google-ads" ? "google-ads" : "sample";
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.map(toSavedKeyword).filter((k): k is SavedKeyword => k !== null)
    : [];
  if (keywords.length === 0) {
    return Response.json({ error: "Seznam neobsahuje žádná klíčová slova." }, { status: 422 });
  }

  const tenant = await resolveTenant(userId, projectId);
  const list = await saveKeywordList(tenant, { name, seed, source, keywords });
  await recordActivity(tenant, {
    kind: "update",
    module: "klicova-slova",
    severity: "info",
    title: "Seznam klíčových slov uložen",
    detail: `${name} · ${keywords.length} slov`,
    actor: "Vy",
  });
  return Response.json({ list });
}

export async function PATCH(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let body: { id?: unknown; tags?: unknown; projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }
  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "Chybí ID seznamu." }, { status: 422 });

  const tags: Record<string, KeywordTag> = {};
  if (body.tags && typeof body.tags === "object") {
    for (const [kw, tag] of Object.entries(body.tags as Record<string, unknown>)) {
      if (isTag(tag)) tags[kw] = tag;
    }
  }

  const tenant = await resolveTenant(userId, projectId);
  await updateKeywordTags(tenant, id, tags);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let id = "";
  let projectId: string | undefined;
  try {
    const body = (await request.json()) as { id?: unknown; projectId?: unknown };
    if (typeof body.id === "string") id = body.id;
    if (typeof body.projectId === "string") projectId = body.projectId;
  } catch {
    /* no body */
  }
  if (!id) return Response.json({ error: "Chybí ID seznamu." }, { status: 422 });

  const tenant = await resolveTenant(userId, projectId);
  await deleteKeywordList(tenant, id);
  return Response.json({ ok: true });
}
