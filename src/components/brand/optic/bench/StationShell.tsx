/** One station of the bench: the far numeral, the engraved art, the near
 *  plate and verb, the floating labels, and the caption with "Open the
 *  station". `crop` is the box of the 1600x900 drawing a narrow screen shows
 *  (the wide stage shows all of it); CSS does the crop, so no script decides
 *  the layout. */
import type { CSSProperties, ReactNode } from "react";
import OpenRoomButton from "../rooms/OpenRoomButton";

export type Crop = readonly [x: number, y: number, w: number, h: number];

/** Inline custom properties (React passes numbers through unitless). */
export const vars = (o: Record<string, string | number>) => o as CSSProperties;

export const cropVars = ([x, y, w, h]: Crop) => vars({ "--cx": x, "--cy": y, "--cw": w, "--ch": h });

export default function StationShell({
  i,
  plateNo,
  plate,
  verb,
  crop,
  art,
  labs,
  cap,
  capW,
  capY,
  open,
  zoom,
}: {
  i: 0 | 1 | 2;
  plateNo: string;
  plate: string;
  verb: string;
  crop: Crop;
  art: ReactNode;
  labs: ReactNode;
  cap: ReactNode;
  capW: number;
  capY: number;
  open: string;
  zoom: string;
}) {
  return (
    <article className="ob-station" id={`ob-st-${i}`} data-ob-station={i} aria-labelledby={`ob-v-${i}`}>
      <div className="ob-st-far" aria-hidden="true" data-n={`0${i + 1}`} />
      <div className="ob-stage">
        <div className="ob-art" style={cropVars(crop)}>
          <svg viewBox="0 0 1600 900" aria-hidden="true" focusable="false">
            {art}
          </svg>
        </div>
        <div className="ob-st-near">
          <p className="ob-plate">
            <span>{plateNo}</span> {plate}
          </p>
          <h2 className="ob-verb" id={`ob-v-${i}`}>
            {verb}
          </h2>
        </div>
        <div className="ob-labs">{labs}</div>
        <div className="ob-cap" style={vars({ "--cw-cap": capW, "--cy-cap": capY })}>
          {cap}
          <OpenRoomButton room={`station-${i + 1}`} zoom={zoom}>
            {open}
          </OpenRoomButton>
        </div>
      </div>
    </article>
  );
}
