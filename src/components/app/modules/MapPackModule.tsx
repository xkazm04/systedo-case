/** Mapa & pozice / Map & rankings — the local map pack on a real OpenStreetMap
 *  map (you vs. competitors) with share-of-voice, plus a keyword ranking ladder.
 *  Server component: composes the Leaflet client (MapPackClient) with the static
 *  SVG ladder (RankLadder). */
import MapPackClient from "@/components/app/modules/MapPackClient";
import RankLadder from "@/components/app/modules/RankLadder";
import LocalLadderSource from "@/components/app/modules/LocalLadderSource";
import type { AreaPack, KeywordRank } from "@/lib/mappack/sample";
import type { LocalSignalsSource } from "@/lib/local-signals/types";

export default function MapPackModule({
  packs,
  ladder,
  projectId,
  ladderLive = false,
  ladderSyncedAt,
}: {
  packs: AreaPack[];
  ladder: KeywordRank[];
  /** the project, so the ladder import control can target its route (omit to hide) */
  projectId?: string;
  /** true when the ladder is imported/synced real ranks, not the sample */
  ladderLive?: boolean;
  /** provenance of a live ladder (reserved for a future GBP/provider label) */
  ladderSource?: "sample" | LocalSignalsSource;
  /** ISO timestamp of the last ladder import/sync */
  ladderSyncedAt?: string;
}) {
  return (
    <div className="stagger space-y-6">
      <MapPackClient areas={packs} />
      {projectId && <LocalLadderSource projectId={projectId} live={ladderLive} syncedAt={ladderSyncedAt} />}
      <RankLadder rows={ladder} />
    </div>
  );
}
