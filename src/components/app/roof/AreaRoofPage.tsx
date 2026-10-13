/** The route body every area roof page shares: resolves the project behind the
 *  area guard and renders its roof, inside a Suspense boundary so the shell
 *  paints instantly on navigation and only the roof streams (Cache Components). */
import { Suspense } from "react";
import { requireProjectArea } from "@/lib/projects/guard";
import type { AreaKey } from "@/lib/projects/areas";
import AreaRoof from "./AreaRoof";

async function Roof({ params, area }: { params: Promise<{ projectId: string }>; area: AreaKey }) {
  const { projectId } = await params;
  const { project, userId } = await requireProjectArea(projectId, area);
  return <AreaRoof area={area} project={project} userId={userId} />;
}

function RoofSkeleton() {
  return (
    <div aria-busy className="mx-auto grid max-w-6xl gap-12 px-4 py-8 sm:px-6 lg:py-12">
      <div className="grid gap-3">
        <span className="h-3 w-32 animate-pulse rounded-[2px] bg-white/[0.06]" />
        <span className="h-12 w-64 animate-pulse rounded-[2px] bg-white/[0.06]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="optic-panel h-36 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function AreaRoofPage({ params, area }: { params: Promise<{ projectId: string }>; area: AreaKey }) {
  return (
    <Suspense fallback={<RoofSkeleton />}>
      <Roof params={params} area={area} />
    </Suspense>
  );
}
