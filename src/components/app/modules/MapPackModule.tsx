/** Mapa & pozice / Map & rankings — the local map pack on a real OpenStreetMap
 *  map (you vs. competitors) with share-of-voice, plus a keyword ranking ladder.
 *  Server component: composes the Leaflet client (MapPackClient) with the static
 *  SVG ladder (RankLadder). */
import MapPackClient from "@/components/app/modules/MapPackClient";
import RankLadder from "@/components/app/modules/RankLadder";
import type { AreaPack, KeywordRank } from "@/lib/mappack/sample";

export default function MapPackModule({
  packs,
  ladder,
}: {
  packs: AreaPack[];
  ladder: KeywordRank[];
}) {
  return (
    <div className="stagger space-y-6">
      <MapPackClient areas={packs} />
      <RankLadder rows={ladder} />
    </div>
  );
}
