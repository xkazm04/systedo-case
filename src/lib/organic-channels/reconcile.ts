/** Channel identity across plan regenerations. ChannelTracks key by channel id;
 *  seeded ids are hand-authored slugs ("facebook-skupiny") while an AI plan mints
 *  `slugify(model-returned name)` — so "Facebookové skupiny" lands under a
 *  different id and the user's configured/live track silently becomes an orphan.
 *
 *  `foldChannelKey` is the diacritics-insensitive, stopword-tolerant identity
 *  fold (the `foldCompetitorName` precedent, extended for channel naming), and
 *  `reconcilePlanTracks` re-keys existing tracks onto a regenerated plan at
 *  PLAN-APPLY time. Apply-time (not id-mint time) is deliberate: minting folded
 *  ids would rewrite the wire id shape (sorted-token slugs in URLs and stored
 *  blobs) and still would not rescue tracks persisted under pre-fold ids —
 *  reconciling at apply heals every id source (seed ids, old AI ids, new AI
 *  ids) while leaving ids stable everywhere else.
 *
 *  FALSE-MERGE GUARD: two genuinely distinct channels must never fold together.
 *  The fold is conservative — token-SET equality after normalization, so a
 *  channel with an extra distinguishing word ("Lokální Facebook skupiny" vs
 *  "Facebook skupiny") never matches — and a fold carry happens only when the
 *  key is unambiguous on BOTH sides (exactly one prev channel and exactly one
 *  plan channel hold it). Anything unmatched stays an orphan the UI surfaces;
 *  we prefer an honest "no longer in the plan" over a guessed merge.
 *
 *  Framework-free (client-safe: the apply happens in the module component). */
import type { ChannelTrack, OrganicChannel } from "./types";

/** Common channel-name abbreviations. Tiny and closed on purpose — every entry
 *  here widens the merge, so only unmistakable synonyms belong. */
const ALIAS: Record<string, string> = { fb: "facebook", ig: "instagram" };

/** Qualifiers that describe HOW a channel is used, not WHICH channel it is —
 *  "Instagram (organicky)" and "Instagram" are the same place. */
const STOPWORDS = new Set([
  "organicky",
  "organicke",
  "organicka",
  "organic",
  "organically",
  "zdarma",
  "free",
  "oficialni",
  "official",
]);

/** Light Czech-aware stem so inflected forms of the SAME word meet:
 *  "facebookové" → "facebook" (adjectival -ov* derivation), "googlu"/"google" →
 *  "googl" (one trailing vowel on longer tokens). Deliberately shallow — a
 *  heavier stemmer would start folding distinct words. */
function stemToken(t: string): string {
  const adj = t.match(/^(.{4,}?)(?:ovy|ove|ova|ovou|ovem|ovych)$/);
  if (adj) return adj[1];
  if (t.length >= 5 && /[aeiouy]$/.test(t)) return t.slice(0, -1);
  return t;
}

/** The ONE identity key for an organic channel name: parenthetical qualifiers
 *  dropped, diacritics folded, tokenized, aliased, stopwords removed, lightly
 *  stemmed, then SORTED token-set — word order and casing never split identity,
 *  but any extra distinguishing token keeps two channels apart. */
export function foldChannelKey(name: string): string {
  const tokens = name
    .replace(/\([^)]*\)/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1) // single-letter connectives ("a", "s", "v")
    .map((t) => ALIAS[t] ?? t)
    .filter((t) => !STOPWORDS.has(t))
    .map(stemToken);
  return [...new Set(tokens)].sort().join(" ");
}

export interface ReconciledTracks {
  /** the next tracks map: carried-forward work re-keyed onto the new plan ids,
   *  plus the unmatched leftovers (kept — user work is never silently dropped) */
  tracks: Record<string, ChannelTrack>;
  /** tracks whose channel is no longer in the plan, with the last-known channel
   *  name for the UI's "no longer in the plan" affordance */
  orphans: Array<{ id: string; name: string }>;
}

/** Re-key existing tracks onto a regenerated plan. Exact id identity always
 *  wins; otherwise a track carries forward via `foldChannelKey` only when the
 *  key is held by exactly one prev channel AND exactly one plan channel (the
 *  false-merge guard). Everything else is reported as an orphan — still present
 *  in `tracks` so nothing is lost, but surfaced for the user to resolve. */
export function reconcilePlanTracks(
  plan: OrganicChannel[],
  prevChannels: OrganicChannel[],
  prevTracks: Record<string, ChannelTrack>
): ReconciledTracks {
  const planIds = new Set(plan.map((c) => c.id));

  // fold key -> prev channel id, ambiguous keys poisoned to null.
  const prevByFold = new Map<string, string | null>();
  for (const c of prevChannels) {
    const key = foldChannelKey(c.name);
    prevByFold.set(key, prevByFold.has(key) ? null : c.id);
  }
  const planFoldCount = new Map<string, number>();
  for (const c of plan) {
    const key = foldChannelKey(c.name);
    planFoldCount.set(key, (planFoldCount.get(key) ?? 0) + 1);
  }

  const tracks: Record<string, ChannelTrack> = {};
  const carried = new Set<string>();
  for (const c of plan) {
    if (prevTracks[c.id]) {
      // Same id survived the regenerate — the track simply stays.
      tracks[c.id] = prevTracks[c.id];
      carried.add(c.id);
      continue;
    }
    const key = foldChannelKey(c.name);
    if (planFoldCount.get(key) !== 1) continue; // two plan channels would claim it
    const prevId = prevByFold.get(key);
    if (!prevId || carried.has(prevId) || planIds.has(prevId) || !prevTracks[prevId]) continue;
    tracks[c.id] = prevTracks[prevId]; // stage, mode, scope, inbox, cadence carry
    carried.add(prevId);
  }

  const orphans: Array<{ id: string; name: string }> = [];
  for (const [id, track] of Object.entries(prevTracks)) {
    if (carried.has(id) || planIds.has(id)) continue;
    tracks[id] = track;
    orphans.push({ id, name: prevChannels.find((c) => c.id === id)?.name ?? id });
  }
  return { tracks, orphans };
}
