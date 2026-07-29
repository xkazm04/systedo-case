/** Segment pending state — see src/app/cena/loading.tsx for why this exists.
 *  Short version: under Cache Components the router analyses each route SEGMENT
 *  for prefetchability, and this page reads the locale cookie. A boundary in a
 *  parent segment does not cover this one. */
export { default } from "../loading";
