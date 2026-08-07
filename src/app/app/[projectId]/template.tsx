/** Per-navigation transition frame for the authed product. A template (unlike a
 *  layout) remounts for every route change beneath it, so each module entry
 *  re-runs the `animate-page-in` fade — client-side navigations get SPA-feel
 *  continuity while the sidebar/layout above stays persistent. Pure CSS (the
 *  app's token animation family; framer-motion stays scoped to marketing
 *  surfaces) — no client JS, and the reduced-motion block neutralises it. */
import type { ReactNode } from "react";

export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
