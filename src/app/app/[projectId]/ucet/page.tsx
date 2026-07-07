/** Účet / Account & Security — profile, an honest security checklist, sign-out
 *  and a GDPR deletion request. Reads the real session; dev-auth sessions expose
 *  no provider/session store, so the checklist is honest about it. Account-level,
 *  available for every project type. */
import { requireProjectModule } from "@/lib/projects/guard";
import { currentSession, currentUserId } from "@/lib/session";
import { DEV_AUTH, signOut } from "@/auth";
import { activeSessionCount, revokeAllSessions } from "@/lib/account/sessions";
import ModulePage from "@/components/app/ModulePage";
import AccountSecurity from "@/components/app/modules/AccountSecurity";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "ucet");

  const session = await currentSession();
  const su = session?.user;
  const user = {
    id: su?.id ?? "—",
    name: su?.name ?? "",
    email: su?.email ?? "",
    image: su?.image ?? null,
  };
  const facts = {
    hasEmail: Boolean(user.email),
    oauth: !DEV_AUTH && Boolean(su),
    devMode: DEV_AUTH,
  };
  // Real session metadata (only meaningful for a real DB session — dev-auth is synthetic).
  const expiresDate = !DEV_AUTH && session?.expires ? session.expires.slice(0, 10) : null;
  const sessionCount = !DEV_AUTH && su?.id ? await activeSessionCount(su.id) : 0;

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  async function signOutEverywhereAction() {
    "use server";
    const uid = await currentUserId();
    if (uid) await revokeAllSessions(uid);
    await signOut({ redirectTo: "/" });
  }

  return (
    <ModulePage moduleKey="ucet">
      <AccountSecurity
        user={user}
        facts={facts}
        expiresDate={expiresDate}
        sessionCount={sessionCount}
        signOutAction={signOutAction}
        signOutEverywhereAction={signOutEverywhereAction}
      />
    </ModulePage>
  );
}
