/** Shared drawing library for the landing, rendered once (hidden): the arrow
 *  glyph, hatch, bloom, the beam glow and the fade masks the station art uses,
 *  then the engraved instruments and the eight lamps. Everything is `ob-`
 *  prefixed and referenced by `<use href>` (ported from the contest variant). */
import BenchArt from "./BenchArt";
import LampArt from "./LampArt";

export default function SpriteDefs() {
  return (
    <svg className="ob-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
          <symbol id="ob-ico-arrow" viewBox="0 0 28 12"><path d="M0 6H26M21 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/></symbol>
          <pattern id="ob-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(237,234,227,.4)" strokeWidth="1"/></pattern>
          <radialGradient id="ob-bloom"><stop offset="0" stopColor="#fff" stopOpacity=".6"/><stop offset=".35" stopColor="#fff" stopOpacity=".14"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient>
          <linearGradient id="ob-beamGlow" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff4e2" stopOpacity="0"/><stop offset=".5" stopColor="#fff4e2" stopOpacity=".3"/><stop offset="1" stopColor="#fff4e2" stopOpacity="0"/></linearGradient>
          <linearGradient id="ob-fadeX" gradientUnits="userSpaceOnUse" x1="0" x2="420" y1="0" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#fff" stopOpacity="1"/></linearGradient>
          <linearGradient id="ob-fadeR0" gradientUnits="userSpaceOnUse" x1="420" x2="600" y1="0" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#fff" stopOpacity="1"/></linearGradient>
          <mask id="ob-mFadeR0" maskUnits="userSpaceOnUse" x="-400" y="-400" width="3000" height="1800"><rect x="-400" y="-400" width="3000" height="1800" fill="url(#ob-fadeR0)"/></mask>
          <linearGradient id="ob-fadeR3" gradientUnits="userSpaceOnUse" x1="410" x2="540" y1="0" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#fff" stopOpacity="1"/></linearGradient>
          <mask id="ob-mFadeR3" maskUnits="userSpaceOnUse" x="-400" y="-400" width="3000" height="1800"><rect x="-400" y="-400" width="3000" height="1800" fill="url(#ob-fadeR3)"/></mask>
          <mask id="ob-mFadeL" maskUnits="userSpaceOnUse" x="-200" y="-200" width="2400" height="1400"><rect x="-200" y="-200" width="2400" height="1400" fill="url(#ob-fadeX)"/></mask>
        <BenchArt />
        <LampArt />
      </defs>
    </svg>
  );
}
