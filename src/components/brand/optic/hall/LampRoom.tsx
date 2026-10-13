"use client";

/** The lamp room: one template, eight rooms (#lamp-1..8). The lamp flies in
 *  from where it hung in the hall; prev/next (or the arrow keys) step around
 *  the ring without adding history, so one Back still returns to the hall. */
import { useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { GROUPS_T } from "../copy/groups";
import { vars } from "../bench/StationShell";
import RoomDialog from "../rooms/RoomDialog";
import RoomBar from "../rooms/RoomBar";
import { swapRoom, useRoom } from "../rooms/roomHash";
import Arrow from "../Arrow";
import LampSample from "./LampSamples";
import { COUNT, descKey, HUE, lampIndex, modsKey, nameKey, pad, SAMPLES } from "./groups";

const RAY_X = [-80, 70, 200, 310, 420, 550, 700];
const WIDE = "(min-width:1100px) and (min-aspect-ratio:5/4)";

export default function LampRoom() {
  const t = useT(GROUPS_T);
  const live = lampIndex(useRoom());
  // while the room closes the hash is gone: keep showing the last lamp
  const [last, setLast] = useState(0);
  if (live >= 0 && live !== last) setLast(live);
  const i = live >= 0 ? live : last;
  const lamp = useRef<SVGSVGElement>(null);
  const name = t(nameKey(i));
  const step = (d: number) => swapRoom(`lamp-${((i + d + COUNT) % COUNT) + 1}`);

  const flyIn = (room: string) => {
    const el = lamp.current;
    const src = document.querySelector(`[data-ob-lamp="${lampIndex(room)}"] .ob-lamp-art`);
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = "";
    if (!src || !window.matchMedia(WIDE).matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = src.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (!b.width || !a.width) return;
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    el.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(${(a.width / b.width).toFixed(3)})`;
    void el.getBoundingClientRect();
    el.style.transition = "transform 1s cubic-bezier(.22,.7,.1,1)";
    requestAnimationFrame(() => (el.style.transform = ""));
  };

  return (
    <RoomDialog
      match="lamp-"
      kind="lamp"
      labelledBy="ob-rl-title"
      className="ob-room ob-room-lamp"
      style={vars({ "--hue": HUE[i] })}
      onShow={flyIn}
      fallbackFocus={(room) => document.querySelector<HTMLElement>(`[data-ob-lamp="${lampIndex(room)}"]`)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        step(e.key === "ArrowRight" ? 1 : -1);
      }}
    >
      <RoomBar
        back={t("backHall")}
        crumbLabel={t("crumbLabel")}
        crumbRoot={t("hallCrumb")}
        current={name}
        startFree={t("startFree")}
        nav={
          <div className="ob-room-nav">
            <button type="button" aria-label={t("prev", { name: t(nameKey((i + 7) % COUNT)) })} onClick={() => step(-1)}>
              <Arrow dir="l" />
            </button>
            <span>
              {pad(i + 1)} / 08
            </span>
            <button type="button" aria-label={t("next", { name: t(nameKey((i + 1) % COUNT)) })} onClick={() => step(1)}>
              <Arrow />
            </button>
          </div>
        }
      />
      <div className="ob-room-stage">
        <svg className="ob-rl-rays" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          <line x1="310" y1="0" x2="310" y2="128" strokeOpacity=".5" strokeWidth="1" />
          {RAY_X.map((x) => (
            <g key={x}>
              <line x1="310" y1="690" x2={x} y2="900" strokeOpacity=".12" strokeWidth="7" />
              <line x1="310" y1="690" x2={x} y2="900" strokeOpacity=".5" strokeWidth="1" />
            </g>
          ))}
        </svg>
        <svg ref={lamp} className="ob-rl-lamp" viewBox="0 0 200 300" aria-hidden="true" focusable="false">
          <use href={`#ob-lamp-${i}`} />
        </svg>
        <div className="ob-rl-text">
          <p className="ob-plate">
            <span>{t("group", { n: pad(i + 1) })}</span> {t("lampRoom")}
          </p>
          <h2 className="ob-rl-title" id="ob-rl-title">
            {name}
          </h2>
          <p className="ob-rl-desc">{t(descKey(i))}</p>
          <p className="ob-rl-cap">
            <b>{t("modsCount")}</b> {t("rlCap")}
          </p>
          <ul className="ob-chips is-in">
            {t(modsKey(i))
              .split("|")
              .map((m, n) => (
                <li key={m} style={vars({ "--n": n })}>
                  {m}
                </li>
              ))}
          </ul>
        </div>
        <figure className="ob-rl-sample">
          <LampSample kind={SAMPLES[i]} words={{ spend: t("sSpend"), headline: t("sHeadline"), lead: t("sLead"), stock: t("sStock") }} />
          <figcaption>
            <b className="ob-tag">{t("stylised")}</b> {t("sampleWord")}
          </figcaption>
        </figure>
      </div>
    </RoomDialog>
  );
}
