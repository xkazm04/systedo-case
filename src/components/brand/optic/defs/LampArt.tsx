/** The eight hanging lamps (viewBox 0 0 200 300), one per module group. They
 *  take their colour from the inherited --hue and brightness from --a. */
export default function LampArt() {
  return (
    <>
      <g id="ob-lamp-cap">
        <path className="ob-l" d="M84 34L88 12H112L116 34Z"/><path className="ob-l2" d="M92 12V2H108V12"/>
        <path className="ob-l" d="M88 252H112L106 270H94Z"/><path className="ob-l2" d="M100 270V290"/>
      </g>
      <g id="ob-lamp-0"><use href="#ob-lamp-cap"/>
        <rect className="ob-l ob-lf" x="60" y="34" width="80" height="218" rx="10"/>
        <path className="ob-l2" d="M60 76H140M60 118H140"/>
        <rect className="ob-l ob-lh" x="72" y="200" width="12" height="36"/><rect className="ob-l ob-lh" x="90" y="174" width="12" height="62"/><rect className="ob-l ob-lh" x="108" y="144" width="12" height="92"/><rect className="ob-l ob-lh" x="126" y="108" width="0" height="0"/>
        <path className="ob-l2" d="M68 236H132"/></g>
      <g id="ob-lamp-1"><use href="#ob-lamp-cap"/>
        <path className="ob-l2" d="M100 34V68"/>
        <circle className="ob-l ob-lf" cx="100" cy="150" r="82"/><circle className="ob-l2" cx="100" cy="150" r="60"/><circle className="ob-l2" cx="100" cy="150" r="38"/>
        <path className="ob-l2" d="M18 150H182M100 68V232"/><circle className="ob-l ob-lh" cx="100" cy="150" r="9"/></g>
      <g id="ob-lamp-2"><use href="#ob-lamp-cap"/>
        <path className="ob-l ob-lf" d="M70 42H130L150 140L130 250H70L50 140Z"/>
        <path className="ob-l2" d="M82 92H118M78 112H122M82 132H112"/>
        <path className="ob-l ob-lh" d="M100 164L84 198L100 232L116 198Z"/><path className="ob-l2" d="M100 172V214"/><circle className="ob-l2" cx="100" cy="200" r="4"/></g>
      <g id="ob-lamp-3"><use href="#ob-lamp-cap"/>
        <path className="ob-l ob-lf" d="M48 150C48 90 76 46 100 36C124 46 152 90 152 150Z"/>
        <path className="ob-l2" d="M48 150A52 14 0 0 0 152 150"/>
        <circle className="ob-l" cx="100" cy="208" r="40"/><circle className="ob-l2" cx="100" cy="208" r="12"/>
        <path className="ob-l2" d="M100 168V248M60 208H140M72 180L128 236M128 180L72 236"/>
        <circle className="ob-l ob-lh" cx="100" cy="182" r="5"/><circle className="ob-l ob-lh" cx="128" cy="208" r="5"/><circle className="ob-l ob-lh" cx="100" cy="234" r="5"/><circle className="ob-l ob-lh" cx="72" cy="208" r="5"/></g>
      <g id="ob-lamp-4"><use href="#ob-lamp-cap"/>
        <rect className="ob-l2" x="90" y="34" width="20" height="36"/>
        <path className="ob-l ob-lf" d="M100 252C62 206 46 178 46 144C46 104 70 70 100 70C130 70 154 104 154 144C154 178 138 206 100 252Z"/>
        <ellipse className="ob-l2" cx="100" cy="140" rx="40" ry="44"/><ellipse className="ob-l2" cx="100" cy="140" rx="26" ry="30"/>
        <path className="ob-l2" d="M54 120C80 110 108 128 146 112"/><circle className="ob-l ob-lh" cx="100" cy="140" r="8"/></g>
      <g id="ob-lamp-5"><use href="#ob-lamp-cap"/>
        <path className="ob-l2" d="M100 34V106M100 182V252"/>
        <circle className="ob-l ob-lf" cx="100" cy="144" r="38"/><circle className="ob-l ob-lh" cx="100" cy="144" r="10"/>
        <path className="ob-l" d="M140 116A48 48 0 0 1 140 172M60 116A48 48 0 0 0 60 172"/>
        <path className="ob-l2" d="M154 96A70 70 0 0 1 154 192M46 96A70 70 0 0 0 46 192"/></g>
      <g id="ob-lamp-6"><use href="#ob-lamp-cap"/>
        <path className="ob-l2" d="M100 34V56"/>
        <path className="ob-l ob-lf" d="M50 56H150L118 156V240H82V156Z"/>
        <circle className="ob-l ob-lh" cx="72" cy="78" r="5"/><circle className="ob-l ob-lh" cx="92" cy="78" r="5"/><circle className="ob-l ob-lh" cx="112" cy="78" r="5"/><circle className="ob-l ob-lh" cx="132" cy="78" r="5"/>
        <circle className="ob-l ob-lh" cx="82" cy="104" r="5"/><circle className="ob-l ob-lh" cx="100" cy="104" r="5"/><circle className="ob-l ob-lh" cx="118" cy="104" r="5"/>
        <circle className="ob-l ob-lh" cx="91" cy="130" r="5"/><circle className="ob-l ob-lh" cx="109" cy="130" r="5"/><circle className="ob-l ob-lh" cx="100" cy="154" r="5"/>
        <circle className="ob-l ob-lh" cx="100" cy="206" r="8"/></g>
      <g id="ob-lamp-7"><use href="#ob-lamp-cap"/>
        <rect className="ob-l ob-lf" x="52" y="46" width="96" height="204" rx="4"/>
        <path className="ob-l2" d="M52 100H148M52 156H148M52 210H148"/>
        <rect className="ob-l ob-lh" x="64" y="68" width="18" height="26"/><rect className="ob-l ob-lh" x="90" y="76" width="18" height="18"/><rect className="ob-l ob-lh" x="116" y="64" width="20" height="30"/>
        <circle className="ob-l ob-lh" cx="74" cy="138" r="12"/><circle className="ob-l ob-lh" cx="104" cy="138" r="12"/><rect className="ob-l ob-lh" x="122" y="122" width="14" height="34"/>
        <rect className="ob-l ob-lh" x="62" y="188" width="34" height="20"/><rect className="ob-l ob-lh" x="62" y="168" width="34" height="18"/><rect className="ob-l ob-lh" x="106" y="178" width="30" height="30"/>
        <rect className="ob-l ob-lh" x="64" y="226" width="20" height="20"/><rect className="ob-l ob-lh" x="92" y="232" width="14" height="14"/><rect className="ob-l ob-lh" x="114" y="222" width="22" height="24"/></g>

    </>
  );
}
