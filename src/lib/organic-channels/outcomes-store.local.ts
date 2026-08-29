/** The organic outcome ledger — LOCAL node:sqlite backend (tables `go_links` and
 *  `go_clicks`, DDL + migration v27 in src/lib/db.ts). Selected when LOCAL_DB is on.
 *  Server-only. Mirrors the Firestore backend's interface exactly.
 *
 *  `bumpGoClick` is an upsert-INCREMENT (`analytics_daily`'s shape), not a
 *  read-modify-write: the public redirect is the most concurrent write in the app
 *  and two hits in the same millisecond must both count. */
import { getDb } from "@/lib/db";
import { GO_LINK_CAP, type GoClickDay, type GoLink } from "./outcomes";

interface LinkRow {
  id: string;
  user_id: string;
  project_id: string;
  url: string;
  channel: string;
  campaign: string;
  created_at: string;
}

function toLink(r: LinkRow): GoLink {
  return {
    id: r.id,
    userId: r.user_id,
    projectId: r.project_id,
    url: r.url,
    channel: r.channel,
    campaign: r.campaign,
    createdAt: r.created_at,
  };
}

export async function saveGoLink(link: GoLink): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO go_links (id, user_id, project_id, url, channel, campaign, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         user_id = excluded.user_id,
         project_id = excluded.project_id,
         url = excluded.url,
         channel = excluded.channel,
         campaign = excluded.campaign,
         created_at = excluded.created_at`
    )
    .run(
      link.id,
      link.userId,
      link.projectId,
      link.url,
      link.channel,
      link.campaign,
      link.createdAt
    );
}

export async function getGoLink(id: string): Promise<GoLink | null> {
  const row = getDb().prepare("SELECT * FROM go_links WHERE id = ?").get(id) as
    | LinkRow
    | undefined;
  return row ? toLink(row) : null;
}

export async function listGoLinks(projectId: string): Promise<GoLink[]> {
  const rows = getDb()
    .prepare("SELECT * FROM go_links WHERE project_id = ? ORDER BY id ASC LIMIT ?")
    .all(projectId, GO_LINK_CAP) as unknown as LinkRow[];
  return rows.map(toLink);
}

export async function listAllGoLinks(limit = 2000): Promise<GoLink[]> {
  const rows = getDb()
    .prepare("SELECT * FROM go_links ORDER BY id ASC LIMIT ?")
    .all(limit) as unknown as LinkRow[];
  return rows.map(toLink);
}

export async function bumpGoClick(linkId: string, day: string): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO go_clicks (link_id, day, count) VALUES (?, ?, 1)
       ON CONFLICT (link_id, day) DO UPDATE SET count = count + 1`
    )
    .run(linkId, day);
}

export async function listGoClickDays(
  linkIds: readonly string[],
  sinceDay: string
): Promise<GoClickDay[]> {
  if (linkIds.length === 0) return [];
  // ONE bound statement, reused per link — deliberately NOT an `IN (…)` list built
  // by interpolating a run of `?`. That idiom is how SQL string-building gets a
  // foothold (scripts/sast.mjs blocks it, and the rule is worth more than the
  // convenience), and the loop costs nothing here: link ids are capped at
  // GO_LINK_CAP per project, the statement is prepared once, and node:sqlite is
  // synchronous and in-process. It also makes this the exact twin of the Firestore
  // backend, which reads one bounded page per link for its own reasons.
  const stmt = getDb().prepare(
    "SELECT link_id, day, count FROM go_clicks WHERE link_id = ? AND day >= ?"
  );
  const out: GoClickDay[] = [];
  for (const id of linkIds) {
    const rows = stmt.all(id, sinceDay) as unknown as Array<{
      link_id: string;
      day: string;
      count: number;
    }>;
    for (const r of rows) out.push({ linkId: r.link_id, day: r.day, count: r.count });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.linkId.localeCompare(b.linkId));
}

export async function pruneGoClicks(beforeDay: string): Promise<number> {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM go_clicks WHERE day < ?")
    .get(beforeDay) as { n: number } | undefined;
  const n = row?.n ?? 0;
  if (n > 0) db.prepare("DELETE FROM go_clicks WHERE day < ?").run(beforeDay);
  return n;
}

export async function clearGoLinks(userId: string, projectId: string): Promise<void> {
  const db = getDb();
  // The counters go first: a click row whose link is already gone is an orphan the
  // rollup would keep skipping forever, and there would be nothing left to find it by.
  db.prepare(
    "DELETE FROM go_clicks WHERE link_id IN (SELECT id FROM go_links WHERE project_id = ?)"
  ).run(projectId);
  db.prepare("DELETE FROM go_links WHERE project_id = ?").run(projectId);
  void userId; // project ids are globally unique; the uid is the interface's, not the query's
}
