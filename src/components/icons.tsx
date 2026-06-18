/** Inline, dependency-free icon set (stroke = currentColor). Keeping these local
 *  avoids an icon library and keeps the bundle lean. */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Adamant mark: a faceted letter "A" — the brand initial as a crystal cut,
 *  with a centre light-seam echoing the adamant (unbreakable gem) theme. */
export function Logo(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 20 12 4l7 16" />
      <path d="M8.4 14h7.2" />
      <path d="M12 8.5v5.5" />
    </svg>
  );
}

export function Menu(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function Close(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ArrowUpRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 17L17 7M8 7h9v9" />
    </svg>
  );
}

export function TrendUp(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h6v6" />
    </svg>
  );
}

export function TrendDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 7l6 6 4-4 8 8" />
      <path d="M14 17h6v-6" />
    </svg>
  );
}

export function Gauge(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 13l4-4" />
      <path d="M5.5 18a8 8 0 1 1 13 0" />
      <circle cx="12" cy="13" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Document(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
      <path d="M10 13h6M10 17h6" />
    </svg>
  );
}

export function Sparkles(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
      <path d="M18 16l.7 1.8L20.5 18.5l-1.8.7L18 21l-.7-1.8L15.5 18.5l1.8-.7z" />
    </svg>
  );
}

export function External(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 5h5v5" />
      <path d="M19 5l-8 8" />
      <path d="M19 14v5H5V5h5" />
    </svg>
  );
}

export function Check(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12l4.5 4.5L19 7" />
    </svg>
  );
}

export function Copy(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

export function Info(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function Target(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Bulb(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.3 1 2.5h6c0-1.2.4-1.9 1-2.5A6 6 0 0 0 12 3z" />
    </svg>
  );
}

export function Clock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function Image(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M21 16l-5-5L5 20" />
    </svg>
  );
}

export function Bell(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
    </svg>
  );
}

export function Bolt(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M13 3L5 14h6l-1 7 8-11h-6z" />
    </svg>
  );
}

export function Layers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 16l9 5 9-5" />
    </svg>
  );
}

export function Refresh(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20 11a8 8 0 0 0-14.3-4.5M4 5v3h3" />
      <path d="M4 13a8 8 0 0 0 14.3 4.5M20 19v-3h-3" />
    </svg>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function Search(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

/** Share-nodes glyph used for the native Web Share trigger. */
export function Share(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

export function Link(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}

export function Download(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4v11" />
      <path d="M7.5 10.5L12 15l4.5-4.5" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function Sun(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function Moon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />
    </svg>
  );
}

/* --------------------------------------------------------------------------
   App-shell icons — sidebar modules, project types and shell controls.
-------------------------------------------------------------------------- */

/** Overview / dashboard home. */
export function Grid(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

/** Campaigns. */
export function Megaphone(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9v6h3l9 4V5L7 9z" />
      <path d="M18 9.5a3 3 0 0 1 0 5" />
    </svg>
  );
}

/** Content / SEO. */
export function Edit(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20h4L18 10l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

/** Social — people. */
export function Users(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17 13.6a5.5 5.5 0 0 1 3.5 5.4" />
    </svg>
  );
}

/** Creative Studio — palette. */
export function Palette(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3a9 9 0 0 0 0 18c1.7 0 2-1.2 1.2-2.2-.8-1-.5-2.4 1-2.8H17a4 4 0 0 0 4-4c0-5-4-7-9-7z" />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Patterns library — bookmark. */
export function Bookmark(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 4h12v17l-6-4-6 4z" />
    </svg>
  );
}

/** Settings — gear. */
export function Cog(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.1 5.1l2.1 2.1M16.8 16.8l2.1 2.1M5.1 18.9l2.1-2.1M16.8 7.2l2.1-2.1" />
    </svg>
  );
}

/** Add / new. */
export function Plus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Project / folder. */
export function Folder(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

/** Project type — e-shop storefront. */
export function Store(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 10h15v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
      <path d="M3.5 10l1.4-5h14.2l1.4 5" />
      <path d="M4 10a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

/** Project type — app window. */
export function AppWindow(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9h17" />
      <path d="M6.6 6.7h.01M9 6.7h.01" />
    </svg>
  );
}

/** Project type — lead-gen inbox. */
export function Inbox(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 13l2.4-7h11.2L20 13" />
      <path d="M4 13v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5h-5a3 3 0 0 1-6 0z" />
    </svg>
  );
}

/** Profit — stacked coins. */
export function Coins(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="8" cy="6.5" rx="4.5" ry="2.3" />
      <path d="M3.5 6.5v3.5c0 1.3 2 2.3 4.5 2.3s4.5-1 4.5-2.3V6.5" />
      <ellipse cx="16" cy="13.5" rx="4.5" ry="2.3" />
      <path d="M11.5 13.5V17c0 1.3 2 2.3 4.5 2.3s4.5-1 4.5-2.3v-3.5" />
    </svg>
  );
}

/** Catalog / product — box. */
export function Box(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

/** Seasonality / schedule — calendar. */
export function Calendar(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  );
}

/** LTV / retention — pulse line. */
export function Pulse(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12h4l2.5-7 4 14 2.5-7H21" />
    </svg>
  );
}

/** Experiment — beaker. */
export function Beaker(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
      <path d="M7.2 15h9.6" />
    </svg>
  );
}

/** Comparison — opposing swap arrows. */
export function Compare(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 8h13l-3.5-3.5" />
      <path d="M20 16H7l3.5 3.5" />
    </svg>
  );
}

/** Lead quality — funnel. */
export function Funnel(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 5h17l-6.5 8v6l-4-2v-4z" />
    </svg>
  );
}

/** Local — map pin. */
export function Pin(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21s6.5-5.6 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.4 6.5 11 6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

/** Topic clusters — pillar + supporting nodes. */
export function Network(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="2.4" />
      <circle cx="12" cy="4.2" r="1.8" />
      <circle cx="5" cy="18" r="1.8" />
      <circle cx="19" cy="18" r="1.8" />
      <path d="M12 9.6V6M10.3 13.4 6.4 16.4M13.7 13.4l3.9 3" />
    </svg>
  );
}

/** Distribution — broadcast waves. */
export function Broadcast(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 15.5a5 5 0 0 0 0-7M6 6a9 9 0 0 0 0 12M18 18a9 9 0 0 0 0-12" />
    </svg>
  );
}
