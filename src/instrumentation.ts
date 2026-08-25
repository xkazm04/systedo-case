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
import { selfHostBootError } from "@/lib/deploy-mode";

export function register() {
  // Fail-closed self-host boot rule (docs/open-source/self-hosting.md §1): a
  // production build with SELF_HOSTED=true and no operator credential refuses
  // to boot unless ALLOW_OPEN=1 was set explicitly — "no password on the
  // internet" must be a decision, never an accident. Pure predicate; throwing
  // here aborts server startup before any request is served.
  const bootError = selfHostBootError(process.env);
  if (bootError) {
    console.error(`[deploy-mode] FATAL ${bootError}`);
    throw new Error(bootError);
  }

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Errors only — no performance tracing.
    tracesSampleRate: 0,
  });
}

export const onRequestError = Sentry.captureRequestError;
