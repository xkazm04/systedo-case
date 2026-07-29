/** Segment pending state — see src/app/cena/loading.tsx for the full reason.
 *  Under Cache Components each route SEGMENT is analysed for prefetchability,
 *  and this page reads the locale cookie; a parent boundary does not cover it. */
export { default } from "../loading";
