/** Segment pending state — see src/app/cena/loading.tsx for the full reason.
 *  A loading.tsx in the parent /lp segment does NOT cover this one: the
 *  prefetchability analysis is per-segment, so each variant route needs its own
 *  boundary or it logs a runtime-data-during-prerendering warning. */
export { default } from "../../loading";
