/** Mapa & pozice / Map & rankings — the local map pack on a real OpenStreetMap
 *  map (you vs. competitors) with share-of-voice, plus a keyword ranking ladder.
 *  Server component: composes the Leaflet client (MapPackClient) with the static
 *  SVG ladder (RankLadder). */
import MapPackClient from "@/components/app/modules/MapPackClient";
import RankLadder from "@/components/app/modules/RankLadder";
import LocalLadderSource from "@/components/app/modules/LocalLadderSource";
import LocalSourcePanel from "@/components/app/modules/LocalSourcePanel";
import type { AreaPack, KeywordRank } from "@/lib/mappack/sample";
import type { LocalSignalsSource } from "@/lib/local-signals/types";

export default function MapPackModule({
  packs,
  ladder,
  projectId,
  packLive = false,
  packSource,
  packSyncedAt,
  packSourceUrl,
  ladderLive = false,
  ladderSource,
  ladderSyncedAt,
  ladderSourceUrl,
}: {
  packs: AreaPack[];
  ladder: KeywordRank[];
  /** true when the competitor pack is imported, not the seeded sample */
  packLive?: boolean;
  /** provenance of a live pack (import | url | gbp) */
  packSource?: "sample" | LocalSignalsSource;
  /** ISO timestamp of the last pack import/sync */
  packSyncedAt?: string;
  /** for source "url": the hosted CSV to refresh the pack from */
  packSourceUrl?: string;
  /** the project, so the ladder import control can target its route (omit to hide) */
  projectId?: string;
  /** true when the ladder is imported/synced real ranks, not the sample */
  ladderLive?: boolean;
  /** provenance of a live ladder (import | url | gbp) */
  ladderSource?: "sample" | LocalSignalsSource;
  /** ISO timestamp of the last ladder import/sync */
  ladderSyncedAt?: string;
  /** for source "url": the hosted CSV to refresh from */
  ladderSourceUrl?: string;
}) {
  return (
    <div className="stagger space-y-6">
      {projectId && (
        <LocalSourcePanel
          projectId={projectId}
          kind="pack"
          live={packLive}
          source={packSource}
          syncedAt={packSyncedAt}
          sourceUrl={packSourceUrl}
        />
      )}
      <MapPackClient areas={packs} live={packLive} />
      {projectId && (
        <LocalLadderSource
          projectId={projectId}
          live={ladderLive}
          source={ladderSource}
          syncedAt={ladderSyncedAt}
          sourceUrl={ladderSourceUrl}
        />
      )}
      <RankLadder rows={ladder} />
    </div>
  );
}
