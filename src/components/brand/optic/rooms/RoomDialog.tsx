"use client";

/** A room: a native modal <dialog> driven by the URL hash (roomHash.ts). Open
 *  = showModal() (top layer; the page behind becomes inert), then the stage
 *  zooms in. Esc, the back buttons and browser Back all close it, and focus
 *  returns to whatever opened it. While it is open the landing root carries
 *  data-room, which lets the bench or the hall fall away behind it. */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { closeRoom, takeOpener, useRoom } from "./roomHash";

type Props = {
  /** The hash key that opens this dialog; a key ending in "-" is a prefix
   *  ("lamp-" opens on lamp-1..lamp-8). A string, so a server component can pass it. */
  match: string;
  kind: "st" | "lamp";
  labelledBy: string;
  className: string;
  style?: CSSProperties;
  /** Runs right after showModal(), before the zoom-in starts. */
  onShow?: (room: string) => void;
  /** Where focus goes on close (wins over the element that opened the room). */
  fallbackFocus?: (room: string) => HTMLElement | null;
  onKeyDown?: (e: KeyboardEvent<HTMLDialogElement>) => void;
  children: ReactNode;
};

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function RoomDialog({ match, kind, labelledBy, className, style, onShow, fallbackFocus, onKeyDown, children }: Props) {
  const room = useRoom();
  const open = room !== "" && (match.endsWith("-") ? room.startsWith(match) : room === match);
  const ref = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState(false);
  const lastRoom = useRef("");
  const onShowRef = useRef(onShow);
  const fallbackRef = useRef(fallbackFocus);
  useEffect(() => {
    onShowRef.current = onShow;
    fallbackRef.current = fallbackFocus;
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const landing = d.closest<HTMLElement>(".ob");
    if (open) {
      lastRoom.current = room;
      if (!d.open) {
        d.showModal();
        d.scrollTop = 0;
        onShowRef.current?.(room);
      }
      landing?.setAttribute("data-room", kind);
      document.documentElement.classList.add("ob-room-open");
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    if (!d.open) return;
    setShown(false);
    landing?.removeAttribute("data-room");
    document.documentElement.classList.remove("ob-room-open");
    // a lamp room may have travelled the ring: its own lamp beats the original opener
    const opener = takeOpener();
    const back = fallbackRef.current?.(lastRoom.current) ?? opener;
    const timer = window.setTimeout(() => {
      d.close();
      back?.focus({ preventScroll: true });
    }, reducedMotion() ? 20 : 560);
    return () => window.clearTimeout(timer);
  }, [open, room, kind]);

  // a navigation away while a room is open must not leave the page locked
  useEffect(() => () => document.documentElement.classList.remove("ob-room-open"), []);

  return (
    <dialog
      ref={ref}
      className={`${className}${shown ? " is-open" : ""}`}
      style={style}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        closeRoom();
      }}
      onKeyDown={onKeyDown}
    >
      {children}
    </dialog>
  );
}
