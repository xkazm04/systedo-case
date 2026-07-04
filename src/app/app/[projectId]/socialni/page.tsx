/** Sociální sítě — the social center, re-hosted inside the project shell. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import SocialClient from "@/components/social/SocialClient";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "socialni");
  return (
    <ModulePage moduleKey="socialni">
      <SocialClient />
    </ModulePage>
  );
}
