/** The three station rooms ("Open the station"): an engraved anatomy of the
 *  instrument, three numbered callouts and an honest note on what each
 *  channel actually does. Server-rendered content inside a client dialog. */
import type { ReactNode } from "react";
import { getT } from "@/lib/i18n/server";
import { ROOMS_T } from "../copy/rooms";
import { cropVars, type Crop } from "../bench/StationShell";
import RoomDialog from "./RoomDialog";
import RoomBar from "./RoomBar";
import { DetectorArt, LensArt, PrismArt } from "./StationRoomArt";

type K = keyof (typeof ROOMS_T)["en"];

const ROOMS: { n: 0 | 1 | 2; crop: Crop; art: ReactNode }[] = [
  { n: 0, crop: [480, 90, 1000, 760], art: <DetectorArt /> },
  { n: 1, crop: [270, 60, 1100, 800], art: <PrismArt /> },
  { n: 2, crop: [270, 70, 1100, 800], art: <LensArt /> },
];

export default async function StationRooms() {
  const t = await getT(ROOMS_T);
  return (
    <>
      {ROOMS.map(({ n, crop, art }) => {
        const k = (s: string) => `r${n}${s}` as K;
        return (
          <RoomDialog key={n} match={`station-${n + 1}`} kind="st" labelledBy={`ob-r${n}-t`} className="ob-room ob-room-st">
            <RoomBar
              back={t("backBench")}
              crumbLabel={t("crumbLabel")}
              crumbRoot={t("benchCrumb")}
              current={t(k("Crumb"))}
              startFree={t("startFree")}
            />
            <div className="ob-room-stage">
              <div className="ob-art" style={cropVars(crop)}>
                <svg viewBox="0 0 1600 900" aria-hidden="true" focusable="false">
                  {art}
                </svg>
              </div>
              <div className="ob-rm-head">
                <p className="ob-plate">
                  <span>{t(k("No"))}</span> {t("anatomy")}
                </p>
                <h2 className="ob-rm-title" id={`ob-r${n}-t`}>
                  {t(k("Title"))}
                </h2>
              </div>
              <ol className="ob-callouts">
                {(["c1", "c2", "c3"] as const).map((c, i) => (
                  <li key={c}>
                    <b>{i + 1}</b>
                    <p>{t(k(c))}</p>
                  </li>
                ))}
              </ol>
              <p className="ob-rm-note">{t(k("Note"))}</p>
              <p className="ob-fig ob-rm-fig">{t("fig")}</p>
            </div>
          </RoomDialog>
        );
      })}
    </>
  );
}
