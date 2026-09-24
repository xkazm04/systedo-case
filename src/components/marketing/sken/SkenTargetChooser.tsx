"use client";

import { NEW_PROJECT_TARGET, type RedeemCandidate } from "@/lib/onboarding/redeem-plan";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/** The redeem's commit boundary: the visitor already owns a project for the scanned
 *  site, so the scan does not silently mint a second one. Each option states what it
 *  will DO before it is pressed — merging adds, never replaces; a new project comes
 *  with its own starter catalog. The token is still unspent while this is on screen. */
const T = {
  cs: {
    heading: "Pro tento web už projekt máte",
    body: "Sken můžete přidat do existujícího projektu, nebo z něj založit nový.",
    addTo: "Přidat do projektu {name}",
    addNote: "Doplní konkurenty a klíčová slova ze skenu. Nic, co jste už upravili, se nepřepíše.",
    createNew: "Založit nový projekt",
    newNote: "Vznikne druhý, samostatný projekt s vlastním úvodním katalogem.",
  },
  en: {
    heading: "You already have a project for this site",
    body: "Add the scan to your existing project, or start a new one from it.",
    addTo: "Add to {name}",
    addNote: "Adds the scan's competitors and keywords. Nothing you already edited is replaced.",
    createNew: "Create a new project",
    newNote: "Creates a second, separate project with its own starter catalog.",
  },
} as const;

export default function SkenTargetChooser({
  candidates,
  onChoose,
  busy = false,
}: {
  candidates: RedeemCandidate[];
  onChoose: (target: string) => void;
  busy?: boolean;
}) {
  const t = useT(T);
  return (
    <div className="mt-5" role="group" aria-labelledby="sken-target-heading">
      <h4 id="sken-target-heading" className="text-base font-semibold text-navy-800">
        {t("heading")}
      </h4>
      <p className="mt-1 text-sm text-navy-700">{t("body")}</p>
      <ul className="mt-4 space-y-3">
        {candidates.map((c) => (
          <li key={c.id} className="rounded-xl border border-line bg-surface p-4">
            <Button onClick={() => onChoose(c.id)} disabled={busy}>
              {t("addTo", { name: c.name })}
            </Button>
            <p className="mt-2 text-xs text-muted">
              <span className="font-medium text-ink">{c.domain}</span> · {t("addNote")}
            </p>
          </li>
        ))}
        <li className="rounded-xl border border-line bg-surface p-4">
          <Button variant="secondary" onClick={() => onChoose(NEW_PROJECT_TARGET)} disabled={busy}>
            {t("createNew")}
          </Button>
          <p className="mt-2 text-xs text-muted">{t("newNote")}</p>
        </li>
      </ul>
    </div>
  );
}
