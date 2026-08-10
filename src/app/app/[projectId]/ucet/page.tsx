/** Účet / Account & Security — profile, an honest security checklist, sign-out
 *  and a GDPR deletion request. Reads the real session; dev-auth sessions expose
 *  no provider/session store, so the checklist is honest about it. Account-level,
 *  available for every project type. */
import { redirect } from "next/navigation";
import { requireProjectModule } from "@/lib/projects/guard";
import { currentSession, currentUserId } from "@/lib/session";
import { DEV_AUTH, signOut } from "@/auth";
import { activeSessionCount, revokeAllSessions } from "@/lib/account/sessions";
import { byomUnlocked, getUsage } from "@/lib/usage";
import { planEntitlement, type PlanEntitlement } from "@/lib/plans";
import ModulePage from "@/components/app/ModulePage";
import AccountSecurity from "@/components/app/modules/AccountSecurity";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ revoke?: string }>;
}) {
  const { projectId } = await params;
  const { revoke } = await searchParams;
  await requireProjectModule(projectId, "ucet");

  const session = await currentSession();
  const su = session?.user;
  const user = {
    // Typed absence, not a display em-dash smuggled into the data model — the
    // component renders the dash. Anything keying/comparing on user.id sees null.
    id: su?.id ?? null,
    name: su?.name ?? "",
    email: su?.email ?? "",
    image: su?.image ?? null,
  };
  const facts = {
    hasEmail: Boolean(user.email),
    oauth: !DEV_AUTH && Boolean(su),
    devMode: DEV_AUTH,
  };
  // Real session metadata (only meaningful for a real DB session — dev-auth is
  // synthetic). Pass the full ISO instant and let the client format it in the
  // user's locale + timezone; slicing to 10 chars truncated in UTC, so a session
  // expiring after midnight CET rendered as the previous day for Czech users.
  const expiresDate = !DEV_AUTH && session?.expires ? session.expires : null;
  // null = dev-auth OR a failed backend read (both unknowable) → the UI shows
  // "unavailable" rather than asserting a measured "0 active sessions".
  const sessionCount = !DEV_AUTH && su?.id ? await activeSessionCount(su.id) : null;

  // The plan, resolved server-side (usage + the same entitlement check /api/byom
  // makes) and passed down. A failed read yields null, and the card is omitted —
  // guessing "Free" would be an assertion about someone's billing, not a fact.
  let entitlement: PlanEntitlement | null = null;
  if (su?.id) {
    try {
      const usage = await getUsage(su.id);
      entitlement = planEntitlement(usage, byomUnlocked(usage.plan));
    } catch {
      entitlement = null;
    }
  }

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  async function signOutEverywhereAction() {
    "use server";
    const uid = await currentUserId();
    // A null result means the revoke actually failed — do NOT sign the user out and
    // reassure them; keep this session and send them back with an error so they know
    // other devices are still signed in.
    if (uid && (await revokeAllSessions(uid)) === null) {
      redirect(`/app/${projectId}/ucet?revoke=error`);
    }
    await signOut({ redirectTo: "/" });
  }

  return (
    <ModulePage moduleKey="ucet">
      <AccountSecurity
        user={user}
        facts={facts}
        expiresDate={expiresDate}
        sessionCount={sessionCount}
        entitlement={entitlement}
        revokeError={revoke === "error"}
        signOutAction={signOutAction}
        signOutEverywhereAction={signOutEverywhereAction}
      />
    </ModulePage>
  );
}
