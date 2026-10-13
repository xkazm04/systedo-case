"use client";

/** One hanging lamp: a real button. Hover (mouse) or focus lights it; a click
 *  opens its room. On a wide stage it hangs on a cord of its own length. */
import { vars } from "../bench/StationShell";
import { CORDS, HUE } from "./groups";

export default function Lamp({
  i,
  num,
  name,
  label,
  lit,
  onSelect,
  onOpen,
}: {
  i: number;
  num: string;
  name: string;
  label: string;
  lit: boolean;
  onSelect: () => void;
  onOpen: (el: HTMLElement) => void;
}) {
  return (
    <li className="ob-lampwrap" style={vars({ "--i": i, "--hue": HUE[i], "--cord": CORDS[i] })}>
      <span className="ob-cord" aria-hidden="true" />
      <button
        className={`ob-lamp${lit ? " is-lit" : ""}`}
        type="button"
        data-ob-lamp={i}
        aria-label={label}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") onSelect();
        }}
        onFocus={onSelect}
        onClick={(e) => onOpen(e.currentTarget)}
      >
        <svg className="ob-lamp-art" viewBox="0 0 200 300" aria-hidden="true" focusable="false">
          <use href={`#ob-lamp-${i}`} />
        </svg>
        <span className="ob-lamp-num">
          <i>{num}</i>
          <span>{name}</span>
        </span>
      </button>
    </li>
  );
}
