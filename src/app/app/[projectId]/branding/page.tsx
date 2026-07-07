/** Branding — brand accent + logo applied to client reports and the microsite,
 *  with a live preview. Persists to the project; account-level, available for
 *  every project type. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import BrandingModule from "@/components/app/modules/BrandingModule";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "branding");
  return (
    <ModulePage moduleKey="branding">
      <BrandingModule
        projectId={project.id}
        name={project.name}
        accentColor={project.accentColor}
        logoUrl={project.logoUrl}
      />
    </ModulePage>
  );
}
