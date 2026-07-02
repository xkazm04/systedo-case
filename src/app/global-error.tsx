"use client";

import { useEffect } from "react";

/** Last-resort error boundary: replaces the ROOT LAYOUT when it crashes, so
 *  nothing from the app shell — globals.css, fonts, LocaleProvider — can be
 *  assumed. It therefore inlines its own <html>/<body> and styles, and shows
 *  both languages (the locale cookie reader lives in the crashed layer). Uses
 *  the brand onyx/teal palette from the viewport constants so even a total
 *  failure stays on-brand. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="cs">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0f16",
          color: "#eaf1f8",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 560, padding: "48px 24px", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#6ee3da",
            }}
          >
            Neočekávaná chyba · Unexpected error
          </p>
          <h1 style={{ margin: "14px 0 0", fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Něco se pokazilo
          </h1>
          <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.6, color: "#b3c3d3" }}>
            Omlouváme se — aplikaci se teď nepodařilo vykreslit. Většinou jde o přechodný výpadek;
            zkuste to prosím znovu.
            <br />
            The app hit an unexpected error. It is usually transient; please try again.
          </p>
          {error.digest ? (
            <p style={{ margin: "12px 0 0", fontSize: 13, fontFamily: "ui-monospace, monospace", color: "#b3c3d3" }}>
              Kód chyby: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              border: 0,
              borderRadius: 999,
              padding: "12px 26px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              background: "#14b8b1",
              color: "#04211f",
            }}
          >
            Zkusit znovu · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
