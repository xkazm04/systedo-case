"use client";

/** "Open the station": a real button that opens a room by its hash key. For a
 *  station room it also aims the camera push-in at that station's instrument. */
import type { ReactNode } from "react";
import Arrow from "../Arrow";
import { openRoom } from "./roomHash";

export default function OpenRoomButton({
  room,
  zoom,
  className = "ob-open",
  label,
  children,
}: {
  room: string;
  /** transform-origin for the bench push-in, e.g. "72% 52%" */
  zoom?: string;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={() => {
        const pin = document.getElementById("ob-bench-pin");
        if (pin && zoom) pin.style.transformOrigin = zoom;
        openRoom(room);
      }}
    >
      {children} <Arrow />
    </button>
  );
}
