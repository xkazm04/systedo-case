/** Segment pending state. Re-exports the root fallback rather than duplicating
 *  it: the visual is deliberately route-agnostic (a centered brand mark).
 *
 *  This file is not cosmetic. Under Cache Components the router analyses each
 *  route SEGMENT for prefetchability, and this page reads the locale cookie via
 *  getT/getServerLocale. A boundary further up (the root loading.tsx, or the
 *  layout's own <Suspense>) does not make this segment prefetchable — without a
 *  boundary here the route logs "Next.js encountered runtime data during
 *  prerendering or a navigation" and navigation to it is never instant. */
export { default } from "../loading";
