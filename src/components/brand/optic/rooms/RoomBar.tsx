"use client";

/** The bar across the top of every room: back (which closes the room, the
 *  same as Esc and browser Back), a breadcrumb, optional prev/next, and the
 *  one amber action. */
import Link from "next/link";
import type { ReactNode } from "react";
import Arrow from "../Arrow";
import { closeRoom } from "./roomHash";

export default function RoomBar({
  back,
  crumbLabel,
  crumbRoot,
  current,
  startFree,
  nav,
}: {
  back: string;
  crumbLabel: string;
  crumbRoot: string;
  current: string;
  startFree: string;
  nav?: ReactNode;
}) {
  return (
    <div className="ob-room-bar">
      <button className="ob-back" type="button" onClick={closeRoom}>
        <Arrow dir="l" /> {back}
      </button>
      <nav className="ob-crumb" aria-label={crumbLabel}>
        <ol>
          <li>
            <button type="button" onClick={closeRoom}>
              {crumbRoot}
            </button>
          </li>
          <li aria-current="page">{current}</li>
        </ol>
      </nav>
      {nav}
      <Link className="ob-btn ob-btn-amber ob-btn-sm" href="/app">
        {startFree}
      </Link>
    </div>
  );
}
