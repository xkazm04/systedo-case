import { Document, Check, ChevronDown, External } from "@/components/icons";

interface AuthorBioProps {
  name: string;
  role: string;
  /** Short, always-visible credential line (the E-E-A-T expertise cue). */
  credential?: string;
  /** Longer bio, revealed on demand. */
  bio?: string;
  /** Optional link to an author / publisher profile. */
  url?: string;
}

/** E-E-A-T byline: avatar, name + role, a short credential line, and an
 *  expandable bio — the credibility module you see on quality publishing sites.
 *  It mirrors the data behind the Person node in the page's Article JSON-LD and
 *  uses a native <details> so it stays server-rendered (same pattern as the FAQ). */
export default function AuthorBio({ name, role, credential, bio, url }: AuthorBioProps) {
  return (
    <div className="mt-6 border-t border-line pt-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy-800 text-brand-400">
          <Document width={18} height={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy-800">{name}</p>
          <p className="text-sm text-muted">{role}</p>
          {credential && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-brand-700">
              <Check width={13} height={13} className="mt-0.5 shrink-0" aria-hidden />
              <span>{credential}</span>
            </p>
          )}
        </div>
      </div>

      {bio && (
        <details className="group mt-3 [&_summary::-webkit-details-marker]:hidden">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-pill text-sm font-medium text-brand-700 transition-colors hover:text-brand-800">
            <span className="group-open:hidden">O autorovi</span>
            <span className="hidden group-open:inline">Skrýt bio</span>
            <ChevronDown
              width={15}
              height={15}
              className="transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <p className="mt-2.5 max-w-prose text-sm leading-relaxed text-muted">{bio}</p>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-inline mt-2 inline-flex items-center gap-1 text-sm"
            >
              Více o autorovi
              <External width={12} height={12} className="-translate-y-px" />
            </a>
          )}
        </details>
      )}
    </div>
  );
}
