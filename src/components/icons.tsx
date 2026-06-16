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

/** Systedo-style mark: an upward "step" suggesting growth. */
export function Logo(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 19V11" />
      <path d="M10 19V7" />
      <path d="M16 19V13" />
      <path d="M4 7l6-3 10 4" />
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
