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
  cs: { kanaly: "Zpět na Kanály", leady: "Zpět na Leady" },
  en: { kanaly: "Back to Channels", leady: "Back to Leads" },
} as const;

/** The modules that hand off to another one and therefore deserve a way back.
 *  A closed list, not "any module key": an arbitrary `?from=` would render a link
 *  to a route that may not exist for this project type. */
const ORIGINS = ["kanaly", "leady"] as const;
type Origin = (typeof ORIGINS)[number];

function isOrigin(v: string | null): v is Origin {
  return v !== null && (ORIGINS as readonly string[]).includes(v);
}

export default function ReturnHint() {
  const t = useT(T);
  const router = useRouter();
  const params = useParams<{ projectId?: string }>();
  const search = useSearchParams();

  const projectId = params?.projectId;
  const from = search.get("from");
  if (!projectId || !isOrigin(from)) return null;

  const href = `/app/${projectId}/${from}`;

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
        {t(from)}
      </Link>
    </div>
  );
}
