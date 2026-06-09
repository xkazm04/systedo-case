/** Wraps every route's content. Unlike layout.tsx, a template re-mounts on each
 *  navigation — so this opacity fade plays on every page change, easing content
 *  in instead of swapping it instantly. Opacity-only (no transform) keeps the
 *  sticky article TOC and chart tooltips behaving correctly. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
