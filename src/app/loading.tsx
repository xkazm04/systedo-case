import { Logo } from "@/components/icons";

/** Root pending state: since the locale cookie makes every route render on
 *  demand, slow Firestore-backed pages used to leave the previous page frozen
 *  for the whole server round-trip. This fallback gives instant navigation
 *  feedback instead. Deliberately sparse — a centered brand mark — so it works
 *  for every route it covers; the reveal animation holds it invisible for the
 *  first ~200 ms so fast navigations never flash it (see globals.css, motion
 *  utilities). Static, bilingual sr-status text: loading.tsx renders before
 *  the page resolves, so it stays free of dynamic locale reads. */
export default function Loading() {
  return (
    <div
      role="status"
      className="animate-loading-reveal flex min-h-[55vh] items-center justify-center py-24"
    >
      <Logo
        width={44}
        height={44}
        className="animate-loading-pulse text-brand-600"
        aria-hidden
      />
      <span className="sr-only">Načítání stránky… · Loading…</span>
    </div>
  );
}
