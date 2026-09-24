/** Which network a change-set's writes may go to — the refusals the write seam was
 *  missing, as pure functions.
 *
 *  `SyncMeta.source` is a PROVENANCE label: a sync whose live fetch fell back to the
 *  sample provider rightly records "sample", so the UI never calls demo numbers live.
 *  That same label is also what `mutatorForTenant` routes writes on, and "sample" is
 *  not a network. So a sync now stamps `network` too (the connector it ran for,
 *  degraded or not), and the write path REFUSES whenever the two disagree, rather
 *  than guessing where the money should go.
 *
 *  Everything here only ever refuses. Nothing arms, widens or re-routes a write:
 *  routing stays on `meta.source` exactly as before, and the Sklik rails in
 *  ./mutator are untouched and still decide a healthy Sklik tenant.
 *
 *  PURE on purpose — no store, no Google Ads module, no credential. The write-path
 *  suites install module doubles for those, and a new static import here would fail
 *  to link against them (see the note at the top of ./mutator). */
import type { AdsSource } from "./types";

/** Why a change-set may not be written to the resolved mutator. */
export type WriteTargetRefusal = "sample-derived" | "network-mismatch";

export type WriteTargetVerdict = { ok: true } | { ok: false; code: WriteTargetRefusal; error: string };

const NETWORK_LABEL: Record<AdsSource, string> = {
  "google-ads": "Google Ads",
  sklik: "Sklik",
  sample: "ukázková data",
};

/** The refusal messages. Czech, and each says what the operator can do next. */
export const WRITE_TARGET_REFUSALS = {
  "sample-derived":
    "Balíček vznikl nad ukázkovými daty, ne nad živým účtem (synchronizace tehdy přešla na ukázková data). Do reklamního účtu ho nezapíšeme — účet znovu synchronizujte a navrhněte nový balíček.",
  "sync-degraded":
    "Poslední synchronizace účtu přešla na ukázková data, takže teď nelze spolehlivě určit, kam by se změna zapsala. Nic jsme nezapsali — účet znovu synchronizujte a zkuste to znovu.",
} as const;

function networkMismatch(setSource: AdsSource, mutatorSource: AdsSource): string {
  return `Balíček patří do sítě ${NETWORK_LABEL[setSource]}, ale zápis by teď šel do sítě ${NETWORK_LABEL[mutatorSource]}. Nic jsme nezapsali — účet znovu synchronizujte a navrhněte nový balíček.`;
}

/** The network a tenant's last sync was FOR: the stamped `network`, or — on a meta
 *  written before the stamp existed — its `source`. */
export function writeNetwork(meta: { source: string; network?: string }): string {
  return meta.network ?? meta.source;
}

/** True when the last sync was for a live network but served sample rows: the
 *  stamped network and the provenance label disagree. A pre-stamp meta (no
 *  `network`) is never degraded here, so it keeps exactly today's behaviour. */
export function syncDegraded(meta: { source: string; network?: string } | null | undefined): boolean {
  return !!meta && writeNetwork(meta) !== meta.source;
}

/** May a change-set whose moves name `setSource` be written through a mutator for
 *  `mutatorSource`?
 *
 *   - `setSource` "sample": the moves were proposed over sample rows (a degraded
 *     sync), so their ids and amounts are not the account's. Refused on apply. On a
 *     REVERT it is let through: if such a set ever landed, undoing it must stay
 *     possible, and the revert restores recorded snapshots, not sample amounts.
 *   - any other `setSource` that is not the mutator's network: refused both ways.
 *   - `setSource` undefined (a set recorded before moves carried a source): allowed,
 *     exactly as before. */
export function writeTargetVerdict(input: {
  setSource: AdsSource | undefined;
  mutatorSource: AdsSource;
  phase?: "apply" | "revert";
}): WriteTargetVerdict {
  const { setSource, mutatorSource, phase = "apply" } = input;
  if (setSource === undefined) return { ok: true };
  if (setSource === "sample") {
    return phase === "revert"
      ? { ok: true }
      : { ok: false, code: "sample-derived", error: WRITE_TARGET_REFUSALS["sample-derived"] };
  }
  if (setSource !== mutatorSource) {
    return { ok: false, code: "network-mismatch", error: networkMismatch(setSource, mutatorSource) };
  }
  return { ok: true };
}
