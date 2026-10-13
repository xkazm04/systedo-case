/** Engraved instrument motifs, one per area (ADR-0013, ADR-0014). Line-art on a
 *  shared vocabulary (`.optic-art .ln/.lo/.dash/.hue/.glow/.beam` in
 *  globals.css): hairlines for the instrument, ONE stroke in the area's hue for
 *  the light it carries. Decorative — always aria-hidden by the caller's wrapper. */
import type { AreaMotif } from "@/lib/projects/areas";

function Beam() {
  return (
    <>
      <path className="lo" d="M8 60h40" />
      <path className="beam" d="M8 60h64" />
      <path className="glow" d="M72 60 152 30M72 60l80 30" />
      <path className="hue" d="M72 60 152 30M72 60l80 30" />
      <path className="ln" d="M64 44l16 16-16 16z" />
      <path className="dash" d="M80 60h72" />
    </>
  );
}

function Detector() {
  return (
    <>
      <path className="beam" d="M4 60h56" />
      <rect className="ln" x="60" y="36" width="34" height="48" rx="2" />
      <path className="lo" d="M66 44h22M66 52h22M66 60h22M66 68h22M66 76h22" />
      <path className="glow" d="M100 70l10-14 10 8 10-22 10 12 10-8" />
      <path className="hue" d="M100 70l10-14 10 8 10-22 10 12 10-8" />
      <path className="dash" d="M100 84h56" />
    </>
  );
}

function Prism() {
  return (
    <>
      <path className="beam" d="M4 70h60" />
      <path className="ln" d="M64 96 92 24l28 72z" />
      <path className="lo" d="M78 60h28" />
      <path className="glow" d="M106 64l50-30M106 66l50-6M106 68l50 18" />
      <path className="hue" d="M106 64l50-30M106 66l50-6M106 68l50 18" />
    </>
  );
}

function Compass() {
  return (
    <>
      <circle className="ln" cx="80" cy="60" r="40" />
      <circle className="dash" cx="80" cy="60" r="28" />
      <path className="lo" d="M80 14v12M80 94v12M34 60h12M114 60h12" />
      <path className="glow" d="M80 60 96 34" />
      <path className="hue" d="M80 60 96 34" />
      <path className="ln" d="M80 60 66 84" />
      <circle className="ln" cx="80" cy="60" r="2.5" />
    </>
  );
}

function Lens() {
  return (
    <>
      <path className="beam" d="M4 40h58M4 60h58M4 80h58" />
      <path className="ln" d="M70 18q14 42 0 84M70 18q-14 42 0 84" />
      <path className="glow" d="M78 40l48 20M78 60h48M78 80l48-20" />
      <path className="hue" d="M78 40l48 20M78 60h48M78 80l48-20" />
      <circle className="ln" cx="132" cy="60" r="5" />
    </>
  );
}

function Antenna() {
  return (
    <>
      <path className="ln" d="M80 104V48M66 104l14-56 14 56" />
      <circle className="ln" cx="80" cy="44" r="4" />
      <path className="glow" d="M60 30a28 28 0 0 1 40 0M50 20a42 42 0 0 1 60 0" />
      <path className="hue" d="M60 30a28 28 0 0 1 40 0M50 20a42 42 0 0 1 60 0" />
      <path className="dash" d="M20 104h120" />
    </>
  );
}

const MOTIFS: Record<AreaMotif, () => React.ReactElement> = {
  beam: Beam,
  detector: Detector,
  prism: Prism,
  compass: Compass,
  lens: Lens,
  antenna: Antenna,
};

export default function AreaArt({ motif, hue, className = "" }: { motif: AreaMotif; hue: string; className?: string }) {
  const Motif = MOTIFS[motif];
  return (
    <svg
      viewBox="0 0 160 120"
      aria-hidden
      className={`optic-art ${className}`}
      style={{ "--art-hue": hue } as React.CSSProperties}
    >
      <Motif />
    </svg>
  );
}
