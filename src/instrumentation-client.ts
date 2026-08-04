/** Client-side observability (Next.js instrumentation-client file convention).
 *  Runs before the app becomes interactive. Errors-only: tracesSampleRate 0,
 *  so no performance tracing, session replay or build-time plugin — just
 *  uncaught-exception capture (plus the explicit captures in error.tsx /
 *  global-error.tsx).
 *
 *  With NEXT_PUBLIC_SENTRY_DSN unset the SDK is never initialized and both
 *  capture calls and the router-transition hook degrade to safe no-ops. */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Errors only — no performance tracing.
    tracesSampleRate: 0,
  });
}

/** Next calls this on every App Router navigation start; Sentry uses it to
 *  stamp navigation breadcrumbs on error events. No-op while uninitialized. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
