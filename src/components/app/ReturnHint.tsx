"use client";

/** "← back to the signpost" affordance for cross-module deep links. When a
 *  module is opened with `?from=kanaly` (the Kanály signpost's next-step CTAs;
 *  schranka links may add `&channel=<twin scope>` for its picker), show a small
 *  return link so the hop reads as one flow, not a dead end. Generic: any module
 *  rendered through ModulePage gets it free. Client-only (reads the URL);
 *  rendered under Suspense per useSearchParams. */
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { ArrowRight } from "@/components/icons";

const T = {
  cs: { back: "Zpět na Kanály" },
  en: { back: "Back to Channels" },
} as const;

export default function ReturnHint() {
  const t = useT(T);
  const router = useRouter();
  const params = useParams<{ projectId?: string }>();
  const search = useSearchParams();

  const projectId = params?.projectId;
  if (!projectId || search.get("from") !== "kanaly") return null;

  const href = `/app/${projectId}/kanaly`;

  return (
    <div className="mb-4 animate-fade-in">
      <Link
        href={href}
        onClick={(e) => {
          // The signpost derives its rows server-side from the twin modules' state
          // (voice trained? channel enabled?). The user came here to CHANGE that
          // state, so a cached RSC payload for /kanaly would show yesterday's next
          // step. push + refresh re-renders the destination's Server Components
          // (refresh acts on the route current when it processes — i.e. kanaly)
          // while keeping client/browser state, per the useRouter docs.
          e.preventDefault();
          router.push(href);
          router.refresh();
        }}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-navy-800"
      >
        <ArrowRight width={12} height={12} className="rotate-180" />
        {t("back")}
      </Link>
    </div>
  );
}
