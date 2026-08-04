/** Server-side observability (Next.js instrumentation file convention).
 *  `register` runs once per server instance (Node and Edge runtimes both);
 *  `onRequestError` receives every server-side error Next captures (server
 *  components, route handlers, middleware) and forwards it to Sentry.
 *
 *  Errors-only by design: tracesSampleRate 0, no build plugin, no source-map
 *  upload. With SENTRY_DSN unset the SDK is never initialized and
 *  captureRequestError degrades to a safe no-op, so local dev, CI and
 *  credential-less builds carry zero observability side effects. */
import * as Sentry from "@sentry/nextjs";

export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Errors only — no performance tracing.
    tracesSampleRate: 0,
  });
}

export const onRequestError = Sentry.captureRequestError;
