"use client";

import { useState } from "react";
import { Bookmark, Check } from "@/components/icons";
import { isDemoProjectId } from "@/lib/projects/demo";
import { useT } from "@/lib/i18n/client";
import { saveContentEntryAction } from "./content-library-actions";

const T = {
  cs: {
    save: "Uložit do knihovny",
    saving: "Ukládám…",
    saved: "Uloženo",
    failed: "Uložení se nezdařilo.",
    title: "Uložit brief (a koncept článku, pokud je hotový) k projektu. Najdete ho v modulu Uložený obsah. Vložené obrázky se neukládají.",
  },
  en: {
    save: "Save to library",
    saving: "Saving…",
    saved: "Saved",
    failed: "Saving failed.",
    title: "Save the brief (and the article draft, if you generated one) to this project. Find it in Saved content. Inserted images are not stored.",
  },
} as const;

/** "Save to library" — the durable half of the workspace. Renders only inside a
 *  real project: with no project (the public /ai-asistent surface) or a demo id
 *  there is nothing to save TO, and the action would refuse anyway, so the button
 *  is not offered rather than offered-and-broken.
 *
 *  `payload` is built at click time so the caller can hand over whatever the
 *  workspace holds at that moment (brief alone, or brief + article draft). */
export default function SaveToLibrary({
  projectId,
  payload,
  onSaved,
}: {
  projectId?: string | null;
  payload: () => unknown;
  /** fired after a successful save (e.g. to refresh a library listing) */
  onSaved?: (id: string) => void;
}) {
  const t = useT(T);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  if (!projectId || isDemoProjectId(projectId)) return null;

  const onClick = async () => {
    if (state === "saving") return;
    setState("saving");
    try {
      const res = await saveContentEntryAction(projectId, payload());
      if (!res) {
        setState("error");
        return;
      }
      setState("saved");
      onSaved?.(res.id);
    } catch {
      setState("error");
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={state === "saving"}
        title={t("title")}
        className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === "saved" ? <Check width={14} height={14} /> : <Bookmark width={14} height={14} />}
        {state === "saving" ? t("saving") : state === "saved" ? t("saved") : t("save")}
      </button>
      {state === "error" && <span className="text-xs text-negative">{t("failed")}</span>}
    </span>
  );
}
