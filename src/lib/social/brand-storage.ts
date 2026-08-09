/** Per-project LOCAL persistence for the social center's "brand voice" field. It used
 *  to live under ONE global localStorage key (`app:social-brand`) shared across every
 *  project, so setting the brand on project A pre-filled (and seeded AI drafts for)
 *  project B. Keying it per project fixes that cross-project bleed. The key derivation
 *  is pure — unit-tested; the read/write are SSR-guarded and non-fatal.
 *
 *  Since the tenant-store move (project-state key `social-brand`, see
 *  components/social/useSocialBrand), localStorage is the MIRROR and fallback, not
 *  the home: the hook migrates a local value to the tenant store on first read
 *  (read-old-write-new) and keeps writing here for anonymous / offline continuity. */
const LEGACY_GLOBAL_KEY = "app:social-brand";

/** The localStorage key for a project's brand voice (legacy global key when no id). */
export function socialBrandKey(projectId?: string): string {
  return projectId ? `${LEGACY_GLOBAL_KEY}:${projectId}` : LEGACY_GLOBAL_KEY;
}

/** Read a project's saved brand voice, migrating the legacy global value on first read
 *  (so an existing user's single brand seeds their first project rather than vanishing).
 *  "" when unset or storage is unavailable. */
export function readSocialBrand(projectId?: string): string {
  if (typeof window === "undefined") return "";
  try {
    const perProject = window.localStorage.getItem(socialBrandKey(projectId));
    if (perProject !== null) return perProject;
    if (projectId) {
      const legacy = window.localStorage.getItem(LEGACY_GLOBAL_KEY);
      if (legacy !== null) return legacy; // one-time migration seed
    }
    return "";
  } catch {
    return "";
  }
}

/** Persist a project's brand voice under its own key. Non-fatal if storage is blocked. */
export function writeSocialBrand(projectId: string | undefined, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(socialBrandKey(projectId), value);
  } catch {
    /* storage unavailable — non-fatal */
  }
}
