/** Segment pending state — see src/app/cena/loading.tsx for the full reason.
 *  Under Cache Components each route SEGMENT is analysed for prefetchability,
 *  and this page reads the locale cookie; the parent segment's own loading.tsx
 *  does NOT cover this nested one. */
export { default } from "../../loading";
