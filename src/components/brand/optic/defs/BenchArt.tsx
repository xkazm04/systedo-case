/** The engraved instruments of the optical bench: rail, carrier, slit,
 *  collimator, detector, readout, prism, lens and focus. Each is a <g id> in
 *  the shared defs, drawn in a 1600x900 frame and placed with <use>. */
export default function BenchArt() {
  return (
    <>

      {/* optical bench rail + carrier */}
      <g id="ob-i-rail">
        <line className="ob-a-ln" x1="-1800" y1="772" x2="3400" y2="772"/>
        <line className="ob-a-ln" x1="-1800" y1="792" x2="3400" y2="792"/>
        <line className="ob-a-tk" x1="-1800" y1="782" x2="3400" y2="782" strokeWidth="10" strokeDasharray="1.2 11"/>
        <line className="ob-a-tk ob-a-tk-maj" x1="-1800" y1="782" x2="3400" y2="782" strokeWidth="20" strokeDasharray="1.6 58.4"/>
      </g>
      <g id="ob-i-carrier"><rect className="ob-a-gl" x="-46" y="758" width="92" height="44"/><line className="ob-a-l2" x1="-46" y1="780" x2="46" y2="780"/><line className="ob-a-l2" x1="-22" y1="758" x2="-22" y2="802"/><line className="ob-a-l2" x1="22" y1="758" x2="22" y2="802"/></g>

      {/* station 01 : slit, collimator, detector, readout */}
      <g id="ob-i-slit">
        <rect className="ob-a-gl ob-a-ht" x="508" y="344" width="26" height="108"/>
        <rect className="ob-a-gl ob-a-ht" x="508" y="468" width="26" height="108"/>
        <rect className="ob-a-l2" x="486" y="322" width="70" height="276"/>
        <line className="ob-a-ln" x1="521" y1="598" x2="521" y2="758"/>
        <path className="ob-a-l2" d="M470 452V468M462 452H478M462 468H478"/>
        <circle cx="521" cy="460" r="46" fill="url(#ob-bloom)"/>
      </g>
      <g id="ob-i-coll">
        <rect className="ob-a-gl" x="620" y="428" width="260" height="64"/>
        <rect className="ob-a-ln" x="610" y="416" width="14" height="88"/>
        <rect className="ob-a-ln" x="876" y="416" width="14" height="88"/>
        <line className="ob-a-l2" x1="624" y1="442" x2="876" y2="442"/>
        <line className="ob-a-l2" x1="624" y1="478" x2="876" y2="478"/>
        <ellipse className="ob-a-ln" cx="672" cy="460" rx="8" ry="28"/>
        <ellipse className="ob-a-ln" cx="828" cy="460" rx="8" ry="28"/>
        <line className="ob-a-ln" x1="750" y1="504" x2="750" y2="758"/>
      </g>
      <g id="ob-i-det">
        <rect className="ob-a-gl" x="980" y="300" width="360" height="320" rx="10"/>
        <rect className="ob-a-l2" x="996" y="316" width="328" height="288" rx="6"/>
        <circle className="ob-a-ln" cx="1110" cy="460" r="84"/>
        <circle className="ob-a-l2" cx="1110" cy="460" r="74"/>
        <circle className="ob-a-l3" cx="1110" cy="460" r="52"/>
        <circle className="ob-a-l2" cx="1110" cy="460" r="26"/>
        <path className="ob-a-l2" d="M1110 340V380M1110 540V548M1018 460H1026M1194 460H1202"/>
        <rect className="ob-a-ln" x="1008" y="556" width="304" height="38"/>
        <line className="ob-a-tk" x1="1012" y1="575" x2="1308" y2="575" strokeWidth="28" strokeDasharray="3 9"/>
        <line className="ob-a-tk" x1="1356" y1="322" x2="1356" y2="598" strokeWidth="30" strokeDasharray="2 12"/>
        <rect className="ob-a-ln" x="1340" y="316" width="32" height="288"/>
        <line className="ob-a-ln" x1="1160" y1="620" x2="1160" y2="758"/>
        <line className="ob-a-l3" x1="1110" y1="300" x2="1110" y2="272"/>
        <circle cx="1110" cy="460" r="60" fill="url(#ob-bloom)" className="ob-det-bloom"/>
      </g>

      {/* station 02 : prism */}
      <g id="ob-i-prism">
        <polygon className="ob-a-gl" points="620,196 840,577 400,577"/>
        <polygon className="ob-a-l2" points="620,228 812,560 428,560"/>
        <polygon className="ob-a-l3" points="620,266 782,545 458,545"/>
        <line className="ob-a-tk" x1="420" y1="590" x2="820" y2="590" strokeWidth="12" strokeDasharray="1 9"/>
        <path className="ob-a-l2" d="M400 577V636M840 577V636"/>
        <path className="ob-a-ln" d="M400 624H840M400 616V632M840 616V632"/>
        <path className="ob-a-l2" d="M590 248A60 60 0 0 0 650 248"/>
        <line className="ob-a-ln" x1="620" y1="577" x2="620" y2="758"/>
        <path className="ob-a-l3" d="M572 520L364 400"/>
        <path className="ob-a-glint" d="M520 372L588 252"/>
        <path className="ob-a-glint" d="M660 266L708 349"/>
      </g>

      {/* station 03 : lens, focus */}
      <g id="ob-i-lens">
        <path className="ob-a-gl" d="M560 334C618 398 618 522 560 586C502 522 502 398 560 334Z"/>
        <path className="ob-a-l2" d="M560 354C604 408 604 512 560 566C516 512 516 408 560 354Z"/>
        <ellipse className="ob-a-l3" cx="560" cy="460" rx="98" ry="170"/>
        <rect className="ob-a-ln" x="538" y="308" width="44" height="26"/>
        <rect className="ob-a-ln" x="538" y="586" width="44" height="26"/>
        <line className="ob-a-ln" x1="560" y1="612" x2="560" y2="758"/>
        <line className="ob-a-l3" x1="560" y1="334" x2="560" y2="586"/>
        <path className="ob-a-ln" d="M560 722H940M560 714V730M940 714V730"/>
        <line className="ob-a-l3" x1="940" y1="470" x2="940" y2="714"/>
      </g>
      <g id="ob-i-focus">
        <circle cx="940" cy="460" r="70" fill="url(#ob-bloom)"/>
        <circle className="ob-a-ln" cx="940" cy="460" r="20"/>
        <path className="ob-a-ln" d="M940 428V448M940 472V492M908 460H928M952 460H972"/>
        <circle cx="940" cy="460" r="5" fill="#fff"/>
      </g>

    </>
  );
}
