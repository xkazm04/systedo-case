"use client";

/** Last-resort boundary for errors thrown in the ROOT layout itself. When this
 *  renders, the normal layout (and its globals.css / providers / locale) may not
 *  have loaded, so it ships its own <html>/<body> and self-contained styles, and
 *  shows both languages rather than relying on locale context. */
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <style>{`
          :root { color-scheme: light dark; }
          .ge-wrap {
            min-height: 100vh; margin: 0; display: grid; place-items: center;
            font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
            background: #f4f7f9; color: #0d1a24; padding: 1.5rem;
          }
          .ge-card {
            max-width: 32rem; text-align: center;
            background: #ffffff; border: 1px solid #e4eaef; border-radius: 16px;
            padding: 2rem;
          }
          .ge-title { font-size: 1.5rem; font-weight: 600; margin: 0; }
          .ge-body { font-size: .875rem; color: #56697a; margin: .75rem 0 0; }
          .ge-btn {
            margin-top: 1.5rem; cursor: pointer; border: 0; border-radius: 999px;
            background: #0e9c97; color: #fff; font-weight: 600; font-size: .875rem;
            padding: .625rem 1.25rem;
          }
          @media (prefers-color-scheme: dark) {
            .ge-wrap { background: #0a0f16; color: #e7eef5; }
            .ge-card { background: #111a24; border-color: #232f3c; }
            .ge-body { color: #92a3b3; }
          }
        `}</style>
        <div className="ge-wrap">
          <div className="ge-card">
            <h1 className="ge-title">Something went wrong · Něco se pokazilo</h1>
            <p className="ge-body">
              The app hit an unexpected error. Please try again.
              <br />
              V aplikaci došlo k neočekávané chybě. Zkuste to prosím znovu.
            </p>
            <button type="button" className="ge-btn" onClick={reset}>
              Try again · Zkusit znovu
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
