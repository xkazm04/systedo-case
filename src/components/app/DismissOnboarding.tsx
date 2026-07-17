"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: { error: "Skrytí se nepodařilo. Zkuste to prosím znovu." },
  en: { error: "Couldn't hide it. Please try again." },
} as const;

/** The onboarding progress card's dismiss control — POSTs the dismissed flag and
 *  refreshes so the server re-resolves the card away. Client island inside the
 *  otherwise-server OnboardingProgressCard. */
export default function DismissOnboarding({ projectId, label }: { projectId: string; label: string }) {
  const t = useT(T);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dismiss = async () => {
    setBusy(true);
    setError(null);
    try {
      // A resolved fetch is not an HTTP success: a 4xx/5xx must not take the
      // refresh path (the card would re-render with the button stuck disabled and
      // no feedback, since busy was only reset in the network-error catch).
      const res = await fetch(`/api/projects/${projectId}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissed: true }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={dismiss}
        disabled={busy}
        className="rounded-pill px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-navy-800 disabled:opacity-50"
      >
        {label}
      </button>
      {error && (
        <span role="alert" className="text-xs text-negative">
          {error}
        </span>
      )}
    </span>
  );
}
