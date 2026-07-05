/** /dashboard — the public, no-login demo of the whole Adamant workspace. Reuses
 *  the real module components inside a demo shell, seeded with mock projects (see
 *  DemoModule + lib/demo/projects). The active module comes from `?m=`, so the
 *  left rail navigates the entire product with illustrative sample data. Marketing
 *  chrome is hidden here (see ChromeGate) so the demo owns the viewport like /app. */
import type { Metadata } from "next";
import { Suspense } from "react";
import DemoShell from "@/components/demo/DemoShell";
import DemoShellSkeleton from "@/components/demo/DemoShellSkeleton";
import DemoModule from "@/components/demo/DemoModule";
import { DEMO_PROJECTS, demoModuleFor, demoProjectForModule } from "@/lib/demo/projects";

export const metadata: Metadata = {
  title: "Živá ukázka aplikace",
  description:
    "Projděte si celou aplikaci Adamant s ukázkovými daty — všechny moduly, bez přihlášení.",
};

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string | string[]; wh?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<DemoShellSkeleton />}>
      <DemoWorkspace searchParams={searchParams} />
    </Suspense>
  );
}

async function DemoWorkspace({
  searchParams,
}: {
  searchParams: Promise<{ m?: string | string[]; wh?: string | string[] }>;
}) {
  const { m, wh } = await searchParams;
  const mod = demoModuleFor(m);
  const project = demoProjectForModule(mod);
  // `?wh=off` previews the Direction 2 not-connected connector picker.
  const whFlag = Array.isArray(wh) ? wh[0] : wh;
  return (
    <DemoShell activeKey={mod.key} project={project} projects={DEMO_PROJECTS}>
      <DemoModule moduleKey={mod.key} project={project} warehouse={whFlag === "off" ? "off" : "on"} />
    </DemoShell>
  );
}
