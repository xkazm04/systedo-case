"use client";

/** W3-B — the hosted LP experiment's CTA, and the ONLY client code on the page.
 *
 *  It exists because a conversion has to be attributed to the arm that was actually
 *  on screen, and the server cannot know a click happened. The served `armId` is
 *  rendered into this element by the server component, so the beacon reports the arm
 *  the visitor saw rather than a fresh (and therefore possibly different) draw.
 *
 *  `sendBeacon` first: it survives the navigation that immediately follows, which a
 *  plain `fetch` does not. `keepalive` fetch is the fallback for the browsers that
 *  lack it. Either way the visitor is NEVER made to wait — the navigation proceeds on
 *  the same tick, and a blocked or failed beacon costs a count, not a click.
 *
 *  It sends one field, `arm`, and nothing else. No id, no fingerprint, no page state.
 *
 *  It is a separate module from LpMicrosite for the mechanical reason that a
 *  `"use client"` boundary cannot live inside a server component's file. */
import { useCallback } from "react";

export default function LpCtaLink({
  armId,
  convertPath,
  target,
  label,
  accent,
}: {
  armId: string;
  /** the slug-scoped beacon endpoint, `/m/{slug}/convert` */
  convertPath: string;
  /** where the CTA sends the visitor — operator-typed (tel:/mailto:/https:) */
  target: string;
  label: string;
  accent: string;
}) {
  const report = useCallback(() => {
    const body = JSON.stringify({ arm: armId });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(convertPath, new Blob([body], { type: "application/json" }));
        return;
      }
    } catch {
      /* fall through to the fetch below */
    }
    try {
      void fetch(convertPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        /* a lost count is a smaller failure than a CTA that does not open */
      });
    } catch {
      /* the click still navigates */
    }
  }, [armId, convertPath]);

  return (
    <a
      href={target}
      onClick={report}
      className="inline-flex items-center rounded-pill px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
      style={{ backgroundColor: accent }}
    >
      {label}
    </a>
  );
}
