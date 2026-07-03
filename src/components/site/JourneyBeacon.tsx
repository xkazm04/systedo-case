"use client";

import { useEffect } from "react";
import { markVisited } from "@/lib/journey";

/** Null-UI beacon rendered by the (server) TaskPager on every journey page:
 *  a mount effect records the page in the visited set + as the last stop, so
 *  the mobile menu can show checkmarks and a "Pokračovat" resume link. The
 *  server shell + tiny client child split is the house convention. */
export default function JourneyBeacon({ current }: { current: string }) {
  useEffect(() => {
    try {
      markVisited(window.localStorage, current);
    } catch {
      /* storage unavailable — the journey simply isn't remembered */
    }
  }, [current]);

  return null;
}
