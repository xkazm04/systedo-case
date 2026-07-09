/** Start — the guided first-run module. Scans the user's own homepage into a
 *  business profile (the aha moment: one click seeds the whole app with their real
 *  business), then walks a type-aware connector checklist whose steps self-complete
 *  from the real stores. New projects land here straight after creation. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import OnboardingModule from "@/components/app/modules/OnboardingModule";
import { resolveOnboardingProgress } from "@/lib/onboarding/progress";
import { currentUserId } from "@/lib/session";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "start");
  const userId = await currentUserId();
  const progress = await resolveOnboardingProgress(project, userId);

  return (
    <ModulePage moduleKey="start">
      <OnboardingModule
        projectType={project.type}
        defaultUrl={project.domain ?? ""}
        progress={progress}
      />
    </ModulePage>
  );
}
