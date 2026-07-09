/** Retired route. "Rychlá reakce" was absorbed as the `leads` channel of the twin's
 *  Schránka zpráv — the SLA clock, the BANT qualification and the snippet library all
 *  live there now, and the reply is drafted in the twin's trained voice. Old bookmarks
 *  and in-app links keep working. */
import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/app/${projectId}/schranka`);
}
