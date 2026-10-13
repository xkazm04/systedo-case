/* ---------------------------------------------------------------------------
   Adamant: the homepage, the Optic Bench (ADR-0014; docs/roadmap/
   app-redesign-plan.md §2.2). A faithful port of the contest-winning landing
   (.contest/arena/adamant-landing/judging/entries/A/variant-3).

   One beam, three moves: a detector measures, a prism triages, a lens
   generates. The page is a walk along an optical bench: 00 the source (hero),
   01-03 the stations, 04 the room of lamps (eight module groups), 05 the five
   apertures (the zero-budget path), 06 the ledger (what each channel honestly
   is), 07 the close.

   This file is the COMPOSER. Markup is server-rendered in brand/optic/*; the
   client islands are the hero canvas (lazy), the hall, the rooms and one
   scroll controller. The site nav and footer stay the root layout's: the
   stage is measured under the sticky nav rather than replacing it.
--------------------------------------------------------------------------- */
import "./optic/styles/base.css";
import "./optic/styles/hero.css";
import "./optic/styles/bench.css";
import "./optic/styles/hall.css";
import "./optic/styles/rooms.css";
import "./optic/styles/path.css";
import SpriteDefs from "./optic/defs/SpriteDefs";
import Hero from "./optic/hero/Hero";
import Bench from "./optic/bench/Bench";
import Hall from "./optic/hall/Hall";
import Path from "./optic/path/Path";
import Ledger from "./optic/ledger/Ledger";
import Close from "./optic/ledger/Close";
import StationRooms from "./optic/rooms/StationRooms";
import LampRoom from "./optic/hall/LampRoom";
import OpticController from "./optic/fx/OpticController";

export default function BrandLanding() {
  return (
    <>
      <div className="ob">
        <SpriteDefs />
        <Hero />
        <Bench />
        <Hall />
        <Path />
        <Ledger />
        <Close />
        <StationRooms />
        <LampRoom />
        <OpticController />
      </div>
      <div className="ob-grain" aria-hidden="true" />
      <div className="ob-vignette" aria-hidden="true" />
    </>
  );
}
