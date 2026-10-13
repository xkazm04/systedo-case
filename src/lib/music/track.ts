/** A music release's own fields (ADR-0017) and the metadata audit: for the
 *  channels the artist chose, which fields each one needs and which the release
 *  is still missing. Pure — the onboarding audit step, the connect wizard and the
 *  tests all read this one answer. The `track` offering kind extends these fields. */
import { musicChannel, requiredMetadata, type MetadataField } from "./channel-catalog";

export interface TrackFields {
  title: string;
  artists: string[];
  /** ISO 3901 code, e.g. CZ-ABC-26-00001 (hyphens optional). */
  isrc?: string;
  /** 12- or 13-digit release barcode. */
  upc?: string;
  /** Composer, lyricist, producer… one line each. */
  credits?: { role: string; name: string }[];
  genre?: string;
  subgenre?: string;
  mood?: string;
  /** BCP-47 language of the vocals, or "instrumental". */
  language?: string;
  explicit?: boolean;
  /** YYYY-MM-DD. */
  releaseDate?: string;
  artworkUrl?: string;
  /** Pixel size of the artwork, when known — stores ask for a square of 3000px. */
  artworkPx?: number;
  lyrics?: string;
  /** The master the artist holds, e.g. "WAV 24-bit / 48 kHz". */
  audioMaster?: string;
  durationSec?: number;
}

const ISRC = /^[A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}$/i;
const UPC = /^\d{12,13}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether one field is present AND well-formed. A malformed ISRC is a gap, not a value. */
export function fieldSatisfied(t: TrackFields, f: MetadataField): boolean {
  switch (f) {
    case "title":
      return t.title.trim().length > 0;
    case "artists":
      return t.artists.some((a) => a.trim().length > 0);
    case "isrc":
      return !!t.isrc && ISRC.test(t.isrc.trim());
    case "upc":
      return !!t.upc && UPC.test(t.upc.trim());
    case "credits":
      return (t.credits ?? []).some((c) => c.name.trim() && c.role.trim());
    case "genre":
      return !!t.genre?.trim();
    case "subgenre":
      return !!t.subgenre?.trim();
    case "mood":
      return !!t.mood?.trim();
    case "language":
      return !!t.language?.trim();
    case "explicit":
      return typeof t.explicit === "boolean";
    case "releaseDate":
      return !!t.releaseDate && DATE.test(t.releaseDate);
    case "artwork":
      return !!t.artworkUrl && (t.artworkPx === undefined || t.artworkPx >= 3000);
    case "lyrics":
      return t.language === "instrumental" || !!t.lyrics?.trim();
    case "audioMaster":
      return !!t.audioMaster?.trim();
  }
}

export interface AuditGap {
  field: MetadataField;
  /** The chosen channels that need this field, by name. */
  neededBy: string[];
}

export interface MetadataAudit {
  gaps: AuditGap[];
  satisfied: MetadataField[];
  /** Share of required fields already satisfied, 0–1 (1 when nothing is required). */
  readiness: number;
}

export function auditTrack(t: TrackFields, channelIds: readonly string[]): MetadataAudit {
  const required = requiredMetadata(channelIds);
  const gaps: AuditGap[] = [];
  const satisfied: MetadataField[] = [];
  for (const [field, ids] of required) {
    if (fieldSatisfied(t, field)) satisfied.push(field);
    else gaps.push({ field, neededBy: ids.map((id) => musicChannel(id)?.name ?? id) });
  }
  // Most-needed gaps first: a field four channels wait on beats one only a single channel asks for.
  gaps.sort((a, b) => b.neededBy.length - a.neededBy.length || a.field.localeCompare(b.field));
  const total = required.size;
  return { gaps, satisfied, readiness: total === 0 ? 1 : satisfied.length / total };
}
