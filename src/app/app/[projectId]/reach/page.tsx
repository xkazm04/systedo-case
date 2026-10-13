/** The reach area roof (ADR-0013): the page the area starts on — its question,
 *  its instrument, and every room the project type has in it, each card fed by
 *  that module's own summary. */
import AreaRoofPage from "@/components/app/roof/AreaRoofPage";

export default function Page({ params }: { params: Promise<{ projectId: string }> }) {
  return <AreaRoofPage params={params} area="reach" />;
}
