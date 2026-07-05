"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import KeywordResearch, { type BriefSeed } from "@/components/ai/KeywordResearch";
import SavedKeywordLists from "@/components/ai/SavedKeywordLists";
import { useProject } from "@/lib/projects/context";
import { briefSeedKey } from "@/lib/projects/brief-seed";

/** Keywords module = research + saved lists, wired exactly like the AI workspace:
 *  saving a list refreshes the list panel, and "create brief" hands the selected
 *  keywords to the content module via session storage + a route change. */
export default function KeywordsModule() {
  const project = useProject();
  const router = useRouter();
  const [savedNonce, setSavedNonce] = useState(0);

  function onCreateBrief(seed: BriefSeed) {
    try {
      sessionStorage.setItem(briefSeedKey(project.id), JSON.stringify(seed));
    } catch {
      /* non-critical — the brief tool still opens, just unseeded */
    }
    router.push(`/app/${project.id}/obsahovy-engine`);
  }

  return (
    <div className="stagger space-y-8">
      <KeywordResearch onCreateBrief={onCreateBrief} onSaved={() => setSavedNonce((n) => n + 1)} />
      <SavedKeywordLists refreshKey={savedNonce} />
    </div>
  );
}
