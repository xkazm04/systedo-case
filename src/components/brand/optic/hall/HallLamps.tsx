"use client";

/** Station 04, the room of lamps. Hover, focus or tap lights a lamp and names
 *  its group in the centre; Enter or a click opens its room (#lamp-N). Until
 *  the visitor takes over, the hall cycles gently through the groups (never on
 *  touch, never with reduced motion, never while a room is open). */
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { GROUPS_T } from "../copy/groups";
import { vars } from "../bench/StationShell";
import { openRoom, useRoom } from "../rooms/roomHash";
import Arrow from "../Arrow";
import Lamp from "./Lamp";
import { CORDS, COUNT, HUE, lampIndex, modsKey, nameKey, pad } from "./groups";

const CONE_X = [-250, -170, -85, 0, 85, 170, 250];

/** Outside the component: a clock read is not part of rendering. */
const now = () => performance.now();
const twoFrames = (f: () => void) => requestAnimationFrame(() => requestAnimationFrame(f));

export default function HallLamps() {
  const t = useT(GROUPS_T);
  const room = useRoom();
  const [sel, setSel] = useState(2);
  const [shown, setShown] = useState(2);
  const [swap, setSwap] = useState(false);
  const [chipsIn, setChipsIn] = useState(false);
  const selRef = useRef(2);
  const timer = useRef(0);
  const touchedAt = useRef(-1e9);
  const pointer = useRef("mouse");
  const stage = useRef<HTMLDivElement>(null);

  /** Light lamp i: the centre cross-fades (name out, text swapped, name and chips back in). */
  const select = useCallback((i: number) => {
    if (i === selRef.current) return;
    selRef.current = i;
    setSel(i);
    setChipsIn(false);
    window.clearTimeout(timer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(i);
      twoFrames(() => setChipsIn(true));
      return;
    }
    setSwap(true);
    timer.current = window.setTimeout(() => {
      setShown(i);
      setSwap(false);
      twoFrames(() => setChipsIn(true));
    }, 170);
  }, []);

  // a lamp room swapped by its prev/next follows into the hall (behind the room, no fade)
  const fromRoom = lampIndex(room);
  const [seenRoom, setSeenRoom] = useState(-1);
  if (fromRoom !== seenRoom) {
    setSeenRoom(fromRoom);
    if (fromRoom >= 0 && fromRoom !== sel) {
      setSel(fromRoom);
      setShown(fromRoom);
    }
  }

  useEffect(() => {
    selRef.current = sel;
  }, [sel]);

  // chips arrive once on mount; then the gentle autonomous cycle
  useEffect(() => {
    const raf = twoFrames(() => setChipsIn(true));
    const el = stage.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return () => cancelAnimationFrame(raf);
    let visible = false;
    const io = new IntersectionObserver((en) => (visible = en[0]?.isIntersecting ?? false), { threshold: 0.4 });
    io.observe(el);
    const id = window.setInterval(() => {
      if (!visible || document.documentElement.classList.contains("ob-room-open")) return;
      if (now() - touchedAt.current < 7000) return;
      select((selRef.current + 1) % COUNT);
    }, 3600);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.clearInterval(id);
      window.clearTimeout(timer.current);
    };
  }, [select]);

  const touch = () => {
    touchedAt.current = now();
  };
  const open = (i: number, from: HTMLElement | null) => {
    const hall = document.getElementById("ob-hall");
    const art = from?.querySelector(".ob-lamp-art") ?? from;
    if (hall && art) {
      const a = art.getBoundingClientRect();
      const h = hall.getBoundingClientRect();
      hall.style.transformOrigin = `${(((a.left + a.width / 2) / window.innerWidth) * 100).toFixed(1)}% ${(((a.top + a.height / 2 - h.top) / h.height) * 100).toFixed(1)}%`;
    }
    openRoom(`lamp-${i + 1}`);
  };

  const name = t(nameKey(shown));
  const mods = t(modsKey(shown)).split("|");
  return (
    <div className="ob-hall-stage" id="ob-hall-stage" ref={stage} style={vars({ "--hue": HUE[sel] })}>
      <p className="ob-kicker ob-hall-kicker">
        <span>{t("kickerNo")}</span> {t("kicker")}
      </p>
      <svg className="ob-hall-cone" viewBox="0 0 700 500" aria-hidden="true" focusable="false" style={vars({ "--ci": sel, "--cy": (CORDS[sel] + 2.32).toFixed(2) })}>
        {CONE_X.map((x) => (
          <g key={x}>
            <line className="ob-cone-h" x1="350" y1="0" x2={350 + x} y2="430" />
            <line x1="350" y1="0" x2={350 + x} y2="430" />
          </g>
        ))}
      </svg>
      <ul className="ob-lamps" onPointerDown={(e) => (pointer.current = e.pointerType || "mouse")}>
        {HUE.map((hue, i) => (
          <Lamp
            key={hue}
            i={i}
            num={pad(i + 1)}
            name={t(nameKey(i))}
            label={t("lampLabel", { name: t(nameKey(i)) })}
            lit={i === sel}
            onSelect={() => {
              touch();
              select(i);
            }}
            onOpen={(el) => {
              if (pointer.current === "touch" && sel !== i) {
                select(i);
                pointer.current = "mouse";
                return;
              }
              touch();
              open(i, el);
            }}
          />
        ))}
      </ul>
      <div className={`ob-hall-centre${swap ? " is-swap" : ""}`}>
        <p className="ob-hc-kick">{t("group", { n: pad(shown + 1) })}</p>
        <h3 className="ob-hc-name">{name}</h3>
        <p className="ob-hc-cap">
          <b>{t("modsCount")}</b> {t("inGroups")}
          <span className="ob-hc-eg">{t("eg")}</span>
        </p>
        <ul className={`ob-chips${chipsIn ? " is-in" : ""}`}>
          {mods.map((m, n) => (
            <li key={m} style={vars({ "--n": n })}>
              {m}
            </li>
          ))}
        </ul>
        <button
          className="ob-open ob-hc-open"
          type="button"
          aria-label={t("openRoomOf", { name })}
          onClick={(e) => open(shown, document.querySelector<HTMLElement>(`[data-ob-lamp="${shown}"]`) ?? e.currentTarget)}
        >
          {t("openRoom")} <Arrow />
        </button>
      </div>
      <p className="ob-hall-hint">{t("hint")}</p>
    </div>
  );
}
