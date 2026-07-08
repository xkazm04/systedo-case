"use client";

/** Map pack (client) — a real OpenStreetMap map of the selected locality's local
 *  pack (you vs. named competitors) beside the ranked listings + share-of-voice.
 *  Plain Leaflet (no react-leaflet wrapper — avoids React-version coupling) over
 *  free CARTO "Positron" tiles (OSM data, no API key); Leaflet is dynamically
 *  imported inside the effect so nothing touches `window` during SSR. Markers are
 *  divIcons themed on Adamant tokens (you = brand). Switching the area tab rebuilds
 *  the map for that city's pack.
 *
 *  Ported from the local-SEO app's LocalityLeafletMap as part of the consolidation
 *  (Phase 4). If a pack ever lacks coordinates, the map degrades to a note and the
 *  ranked listings alongside still carry every competitor. */
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Pill } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import { shareOfVoice, sortByRank } from "@/lib/mappack/compute";
import type { AreaPack, MapListing } from "@/lib/mappack/sample";

const T = {
  cs: {
    searchArea: "Vyhledávací oblast",
    liveMap: "Mapa · OpenStreetMap (ukázková pozice)",
    tilesUnavailable: "Mapové dlaždice nejsou dostupné — pořadí vedle stále ukazuje každého konkurenta.",
    noGeo: "Pro tuto oblast zatím nejsou souřadnice.",
    you: "vy",
    competitor: "konkurent",
    inPack: "{n} v balíčku",
    rankedTitle: "Pořadí v mapě",
    shareTitle: "Podíl na proklicích",
    reviewsShort: "recenzí",
    liveNote: "Reálné dlaždice OpenStreetMap · jeden marker na konkurenta, podle souřadnic. Ilustrativní data.",
    mapAria: "Mapa místních výsledků",
  },
  en: {
    searchArea: "Search area",
    liveMap: "Map · OpenStreetMap (sample ranking)",
    tilesUnavailable: "Map tiles unavailable — the ranked listings alongside still show every competitor.",
    noGeo: "No coordinates for this area yet.",
    you: "you",
    competitor: "competitor",
    inPack: "{n} in the pack",
    rankedTitle: "Map-pack ranking",
    shareTitle: "Share of clicks",
    reviewsShort: "reviews",
    liveNote: "Real OpenStreetMap tiles · one marker per competitor, keyed on coordinates. Illustrative data.",
    mapAria: "Local map pack",
  },
} as const;

/** rank → Pill tone: 1–3 positive, 4–10 warning, 11+ coral. */
function rankTone(rank: number) {
  if (rank <= 3) return "positive" as const;
  if (rank <= 10) return "negative" as const;
  return "coral" as const;
}

function markerHtml(rank: number, you: boolean): string {
  const bg = you ? "var(--color-brand-500)" : "var(--color-surface)";
  const fg = you ? "var(--color-navy-900)" : "var(--color-navy-800)";
  return (
    `<div style="display:grid;place-items:center;width:30px;height:30px;` +
    `border:1.5px solid var(--color-navy-800);border-radius:7px;background:${bg};color:${fg};` +
    `font-weight:700;font-size:13px;box-shadow:0 1px 3px rgba(0,0,0,0.28)">${rank}</div>`
  );
}

function LeafletMap({ points, label }: { points: MapListing[]; label: string }) {
  const t = useT(T);
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ref.current || points.length === 0) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;

    import("leaflet")
      .then(({ default: L }) => {
        if (cancelled || !ref.current) return;
        map = L.map(ref.current, {
          zoomControl: true,
          scrollWheelZoom: false, // don't hijack page scroll inside the dashboard
          attributionControl: true,
        });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          subdomains: "abcd",
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap &copy; CARTO",
        }).addTo(map);

        const you = points.find((p) => p.you) ?? points[0];
        L.circle([you.lat, you.lng], {
          radius: 900,
          color: "#14b8b1",
          weight: 1.5,
          opacity: 0.6,
          fillColor: "#14b8b1",
          fillOpacity: 0.06,
          dashArray: "4 4",
        }).addTo(map);

        for (const p of points) {
          L.marker([p.lat, p.lng], {
            icon: L.divIcon({ html: markerHtml(p.rank, p.you), className: "", iconSize: [30, 30], iconAnchor: [15, 15] }),
            title: `#${p.rank} · ${p.name}`,
            riseOnHover: true,
          })
            .addTo(map)
            .bindTooltip(`#${p.rank} · ${p.name}`, { direction: "top", offset: [0, -14] });
        }

        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
        setTimeout(() => map && map.invalidateSize(), 60);
      })
      .catch((err) => {
        console.warn("[map] Leaflet failed to load — rendering fallback:", err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [points]);

  if (failed) {
    return (
      <div className="grid h-full w-full place-items-center bg-surface px-6 text-center">
        <p className="max-w-xs text-xs text-muted">{label}</p>
      </div>
    );
  }
  return <div ref={ref} className="h-full w-full bg-surface" role="img" aria-label={t("mapAria")} />;
}

export default function MapPackClient({ areas }: { areas: AreaPack[] }) {
  const t = useT(T);
  const fmt = useFormatters();
  const [selectedId, setSelectedId] = useState(areas[0]?.areaId ?? "");
  const selected = areas.find((a) => a.areaId === selectedId) ?? areas[0];

  if (!selected) return null;

  const ranked = sortByRank(selected.listings);
  // share-of-voice per listing, aligned to the ranked order
  const shareById = new Map(shareOfVoice(selected.listings).map((s) => [s.id, s.share]));
  const shareByRank = ranked.map((l) => ({ ...l, share: shareById.get(l.id) ?? 0 }));
  const maxShare = Math.max(...shareByRank.map((r) => r.share), 0.0001);

  return (
    <div className="space-y-4">
      {/* area tabs */}
      <div className="flex flex-wrap gap-2">
        {areas.map((a) => {
          const active = a.areaId === selected.areaId;
          return (
            <button
              key={a.areaId}
              onClick={() => setSelectedId(a.areaId)}
              className={
                "rounded-pill border px-3.5 py-1.5 text-sm font-semibold transition-colors " +
                (active
                  ? "border-brand-400 bg-brand-500/10 text-brand-accent"
                  : "border-line text-muted hover:border-brand-300 hover:text-navy-800")
              }
            >
              {a.city}
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.35fr_1fr]">
        {/* map */}
        <figure className="card overflow-hidden">
          <figcaption className="flex items-center justify-between border-b border-line px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            <span>{t("searchArea")} · {selected.city}</span>
            <span className="text-brand-accent">{t("liveMap")}</span>
          </figcaption>
          <div className="aspect-[16/10] w-full">
            <LeafletMap key={selected.areaId} points={selected.listings} label={t("tilesUnavailable")} />
          </div>
          <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-navy-800 bg-brand-500" aria-hidden /> {t("you")}
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-navy-800 bg-surface" aria-hidden /> {t("competitor")}
            </span>
            <span className="tnum">{t("inPack", { n: selected.listings.length })}</span>
          </div>
        </figure>

        {/* ranked listings + share of voice */}
        <div className="space-y-5">
          <div className="card overflow-hidden">
            <h3 className="border-b border-line px-5 py-3 text-sm font-semibold text-navy-800">{t("rankedTitle")}</h3>
            <ul>
              {ranked.map((l) => (
                <li key={l.id} className="flex items-center gap-3 border-b border-line/70 px-5 py-3 last:border-0">
                  <Pill tone={rankTone(l.rank)}>#{l.rank}</Pill>
                  <div className="min-w-0 flex-1">
                    <div className={"truncate text-sm font-medium " + (l.you ? "text-brand-accent" : "text-navy-800")}>
                      {l.name}
                    </div>
                    <div className="tnum text-xs text-muted">
                      {fmt.fmtDecimal(l.rating, 1)} ★ · {fmt.fmtInt(l.reviews)} {t("reviewsShort")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card overflow-hidden">
            <h3 className="border-b border-line px-5 py-3 text-sm font-semibold text-navy-800">{t("shareTitle")}</h3>
            <div className="space-y-2.5 px-5 py-4">
              {shareByRank.map((r) => (
                <div key={r.id} className="flex items-center gap-3">
                  <span className={"w-28 shrink-0 truncate text-xs " + (r.you ? "font-semibold text-brand-accent" : "text-muted")}>
                    {r.name}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-pill bg-line/50">
                    <div
                      className={"h-full rounded-pill " + (r.you ? "bg-brand-500" : "bg-navy-400")}
                      style={{ width: `${(r.share / maxShare) * 100}%` }}
                    />
                  </div>
                  <span className="tnum w-10 shrink-0 text-right text-xs font-semibold text-navy-700">
                    {fmt.fmtPct(r.share)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted">{t("liveNote")}</p>
    </div>
  );
}
