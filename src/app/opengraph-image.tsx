/** Data-driven Open Graph share card for the case study. Next.js auto-wires this
 *  as og:image (and twitter:image) for the home route, so sharing the portfolio
 *  URL on LinkedIn/Slack renders a branded card with a real headline stat instead
 *  of a blank text-only link. Rendered at request/build time via next/og. */
import { ImageResponse } from "next/og";
import { performance } from "@/lib/data";
import { totalsOf } from "@/lib/metrics";
import { fmtCZKCompact, fmtMultiple, fmtPct } from "@/lib/format";

export const alt =
  "Adamant — marketingová case study: výkonnostní dashboard, AI asistent a správa kampaní";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const year = totalsOf(performance.daily.slice(-365));
  const stats = [
    { label: "Roční obrat z marketingu", value: fmtCZKCompact(year.revenue) },
    { label: "Průměrné PNO", value: fmtPct(year.pno) },
    { label: "ROAS", value: fmtMultiple(year.roas) },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #081521 0%, #0d1f31 58%, #0b1b2b 100%)",
          padding: "76px 80px",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* top: eyebrow */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", height: "14px", width: "14px", borderRadius: "9999px", background: "#14b8b1" }} />
          <div
            style={{
              display: "flex",
              fontSize: "26px",
              letterSpacing: "4px",
              fontWeight: 600,
              color: "#6ee3da",
            }}
          >
            CASE STUDY · POZICE AI VIBECODER
          </div>
        </div>

        {/* middle: title + client */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: "76px", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-2px" }}>
            Tři úkoly, jeden klient,
          </div>
          <div style={{ display: "flex", fontSize: "76px", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-2px", color: "#6ee3da" }}>
            produkční řemeslo.
          </div>
          <div style={{ display: "flex", marginTop: "26px", fontSize: "30px", color: "#92a3b3" }}>
            Dashboard · AI marketingový asistent · správa Google Ads kampaní — {performance.client.name} ({performance.client.domain})
          </div>
        </div>

        {/* bottom: hero stats from the real dataset */}
        <div style={{ display: "flex", gap: "20px" }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                borderRadius: "20px",
                border: "1px solid rgba(110,227,218,0.18)",
                background: "rgba(20,184,177,0.08)",
                padding: "26px 30px",
              }}
            >
              <div style={{ display: "flex", fontSize: "23px", color: "#92a3b3" }}>{s.label}</div>
              <div style={{ display: "flex", marginTop: "10px", fontSize: "48px", fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
