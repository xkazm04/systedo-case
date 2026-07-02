/** Shared Open Graph share card for article surfaces (/clanek and the
 *  generated /clanek/vykon report). Clones the root opengraph-image's brand
 *  language — the same gradient, teal accent and eyebrow-dot — but is fed from
 *  `article.meta`, so a shared article link renders ITS OWN headline, category
 *  and reading time instead of the unrelated portfolio card. Server-only
 *  (next/og); each segment's `opengraph-image.tsx` stays a two-liner. */
import { ImageResponse } from "next/og";
import type { Article } from "./article";
import { fmtDate } from "./format";
import { SITE_NAME } from "./site";

export const OG_SIZE = { width: 1200, height: 630 };

const truncate = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;

/** Accessible description of the card, mirrored from what it renders. */
export function articleOgAlt(meta: Article["meta"]): string {
  return `${meta.title} — ${meta.category}, ${meta.readingMinutes} min čtení`;
}

/** Render the article share card (1200×630 PNG via satori). */
export function articleOgImage(meta: Article["meta"]): ImageResponse {
  const title = truncate(meta.title, 96);
  const perex = truncate(meta.perex, 160);
  // Long buying-guide titles need a smaller display size to stay on ~3 lines.
  const titleSize = title.length > 64 ? "54px" : "66px";

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
          padding: "72px 80px",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* top: category + reading time eyebrow */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              height: "14px",
              width: "14px",
              borderRadius: "9999px",
              background: "#14b8b1",
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: "26px",
              letterSpacing: "4px",
              fontWeight: 600,
              color: "#6ee3da",
              textTransform: "uppercase",
            }}
          >
            {meta.category} · {meta.readingMinutes} min čtení
          </div>
        </div>

        {/* middle: article headline + perex */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: "-1.5px",
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "26px",
              fontSize: "28px",
              lineHeight: 1.4,
              color: "#92a3b3",
            }}
          >
            {perex}
          </div>
        </div>

        {/* bottom: author + brand + freshness */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(110,227,218,0.18)",
            paddingTop: "30px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: "28px", fontWeight: 600 }}>{meta.author}</div>
            <div style={{ display: "flex", marginTop: "6px", fontSize: "22px", color: "#92a3b3" }}>
              {meta.role}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ display: "flex", fontSize: "22px", color: "#92a3b3" }}>
              {fmtDate(meta.dateModifiedISO ?? meta.dateISO)}
            </div>
            <div
              style={{
                display: "flex",
                borderRadius: "9999px",
                border: "1px solid rgba(110,227,218,0.18)",
                background: "rgba(20,184,177,0.08)",
                padding: "10px 22px",
                fontSize: "22px",
                fontWeight: 600,
                color: "#6ee3da",
              }}
            >
              {SITE_NAME}
            </div>
          </div>
        </div>
      </div>
    ),
    OG_SIZE
  );
}
