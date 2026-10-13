/** Station 06, the ledger: what each channel honestly is. Google Ads is the
 *  only live-data connector (solid line); Sklik is ad-copy checks and keyword
 *  suggestions (dashed); Meta and TikTok are publishing (dotted). */
import { getT } from "@/lib/i18n/server";
import { LEDGER_T } from "../copy/path";
import { SPECTRUM } from "../spectrum";
import { vars } from "../bench/StationShell";

type K = keyof (typeof LEDGER_T)["en"];
const CHANNELS: { name: string; desc: K; style: "solid" | "dashed" | "dotted"; line: string; hue: string }[] = [
  { name: "Google Ads", desc: "gaDesc", style: "solid", line: "ob-ch", hue: "var(--color-s-cyan)" },
  { name: "Sklik", desc: "skDesc", style: "dashed", line: "ob-ch ob-ch-dash", hue: "var(--color-s-green)" },
  { name: "Meta", desc: "pubDesc", style: "dotted", line: "ob-ch ob-ch-dot", hue: "var(--color-s-blue)" },
  { name: "TikTok", desc: "pubDesc", style: "dotted", line: "ob-ch ob-ch-dot", hue: "var(--color-s-red)" },
];
const FACTS = [
  ["f1T", "f1D"],
  ["f2T", "f2D"],
  ["f3T", "f3D"],
] as const;

export default async function Ledger() {
  const t = await getT(LEDGER_T);
  return (
    <section className="ob-ledger" id="ob-ledger" aria-labelledby="ob-ledger-h">
      <div className="ob-ledger-stage">
        <header className="ob-ledger-head">
          <p className="ob-kicker">
            <span>{t("kickerNo")}</span> {t("kicker")}
          </p>
          <h2 id="ob-ledger-h" className="ob-h-sec">
            {t("h1")} <em>{t("h2")}</em>
          </h2>
        </header>
        <div className="ob-legend-wrap">
          <div className="ob-spec" aria-hidden="true">
            {SPECTRUM.map((h) => (
              <i key={h} style={vars({ "--h": h })} />
            ))}
          </div>
          <ul className="ob-chan">
            {CHANNELS.map((c) => (
              <li key={c.name}>
                <svg viewBox="0 0 240 12" aria-hidden="true" focusable="false">
                  <line className={c.line} x1="0" y1="6" x2="240" y2="6" style={{ stroke: c.hue }} />
                </svg>
                <div>
                  <h3>{c.name}</h3>
                  <p>{t(c.desc)}</p>
                </div>
                <span className="ob-sty">{t(c.style)}</span>
              </li>
            ))}
          </ul>
        </div>
        <ol className="ob-facts">
          {FACTS.map(([h, p], i) => (
            <li key={h}>
              <b>0{i + 1}</b>
              <h3>{t(h)}</h3>
              <p>{t(p)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
