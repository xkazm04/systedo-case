"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The onboarding progress card's dismiss control — POSTs the dismissed flag and
 *  refreshes so the server re-resolves the card away. Client island inside the
 *  otherwise-server OnboardingProgressCard. */
export default function DismissOnboarding({ projectId, label }: { projectId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const dismiss = async () => {
    setBusy(true);
    try {
      await fetch(`/api/projects/${projectId}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissed: true }),
      });
      router.refresh();
    } catch {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={dismiss}
      disabled={busy}
      className="rounded-pill px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-navy-800 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
