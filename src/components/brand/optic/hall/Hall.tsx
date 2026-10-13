/** Station 04, the room of lamps: eight hanging lamps, one per module group.
 *  The interactive stage is a client island; the camera pull-back on arrival
 *  (scale + .is-in) is driven by the landing controller. */
import { getT } from "@/lib/i18n/server";
import { GROUPS_T } from "../copy/groups";
import HallLamps from "./HallLamps";

export default async function Hall() {
  const t = await getT(GROUPS_T);
  return (
    <section className="ob-hall" id="ob-hall" aria-labelledby="ob-hall-h">
      <h2 className="ob-sr" id="ob-hall-h">
        {t("hallH")}
      </h2>
      <HallLamps />
    </section>
  );
}
