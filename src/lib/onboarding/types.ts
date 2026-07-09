/** Onboarding state model. A brand-new project lands on the `start` module: it
 *  scans the user's own homepage into a business profile (the `onboarding-scan`
 *  op), which one click applies — seeding the competitor set + the profile every
 *  grounded module reads — and tracks a type-aware connector checklist whose steps
 *  self-complete from the real stores. Only the scan profile + a couple of flags
 *  are persisted here; each connector step's "done" is derived live, never stored.
 *  Framework-free (the AI result type is the shared contract). */
import type { OnboardingScanResult } from "@/lib/ai-types";

/** The applied scan profile: the AI result plus the URL it was scanned from. */
export interface OnboardingScanProfile extends OnboardingScanResult {
  /** the homepage the profile was scanned from */
  scannedUrl?: string;
  /** ISO timestamp the scan was applied */
  appliedAt?: string;
}

/** Persisted per project. Absent → the project has done nothing yet (fresh). */
export interface OnboardingState {
  /** the applied scan profile, once the user ran + applied a scan */
  scan?: OnboardingScanProfile;
  /** true once a scan has been applied (it seeds the app's grounding) */
  scanApplied?: boolean;
  /** the user dismissed the onboarding progress card on the overview */
  dismissed?: boolean;
  /** ISO timestamp of the last save */
  updatedAt: string;
}

// --------------------------------------------------------------------------
// Request sanitizer — used by the apply route to coerce the (user-edited) scan
// profile from the wire into a clean, bounded object. Framework-free.
// --------------------------------------------------------------------------

const KNOWN_TYPES = new Set(["eshop", "app", "leadgen", "content", "local"]);

const str = (v: unknown, max: number): string =>
  (typeof v === "string" ? v.trim() : "").slice(0, max);

const strList = (v: unknown, maxCount: number, maxLen: number): string[] => {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of v) {
    const s = str(item, maxLen);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= maxCount) break;
  }
  return out;
};

/** Coerce a (user-edited) scan profile from the wire, or null when there's nothing
 *  usable (needs at least a summary or an offering). */
export function sanitizeScanProfile(raw: unknown): OnboardingScanProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary = str(o.summary, 800);
  const offering = str(o.offering, 400);
  if (!summary && !offering) return null;
  const profile: OnboardingScanProfile = {
    businessName: str(o.businessName, 120),
    summary,
    offering,
    audience: str(o.audience, 300),
    toneOfVoice: str(o.toneOfVoice, 160),
    keywords: strList(o.keywords, 12, 120),
    competitors: strList(o.competitors, 8, 80),
  };
  const type = str(o.suggestedType, 20).toLowerCase();
  if (KNOWN_TYPES.has(type)) profile.suggestedType = type;
  const url = str(o.scannedUrl, 2048);
  if (url) profile.scannedUrl = url;
  return profile;
}
