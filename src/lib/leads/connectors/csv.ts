/** CSV / paste connector — the day-one ingestion path, and the LinkedIn fallback
 *  (Campaign Manager's "Download leads" export needs no approvals at all).
 *
 *  REUSE, NOT FORK (docs/leads/design.md §A7): the quote-aware RFC-4180 tokenizer is
 *  `catalog/feed.ts#parseCsvRecords` — already shared with the generic ERP adapter —
 *  and the tolerant cs/en date parser is `lead-quality/import.ts#parseLeadDate`.
 *  This file adds only what neither has: the IDENTITY column vocabulary (a funnel
 *  tally row has no name, email or phone) and the mapping onto `LeadEvent`.
 *
 *  Pure and offline-testable: `parseContactCsv` does no I/O and reads no clock. */
import { parseCsvRecords } from "@/lib/catalog/feed";
import { parseLeadDate } from "@/lib/lead-quality/import";
import { normalizeForSearch } from "@/lib/nav";
import { LEAD_ROW_CAP } from "@/lib/lead-quality/types";
import {
  clampText,
  EMAIL_MAX,
  NAME_MAX,
  NOTE_MAX,
  PHONE_MAX,
  type LeadEvent,
  type PipelineStage,
} from "../types";
import type { ConnectorMeta, LeadConnector, PullOptions, PullResult, StoredLeadConnection } from "./types";

/** Canonical columns this connector understands. */
type Col =
  | "name"
  | "email"
  | "phone"
  | "company"
  | "source"
  | "campaign"
  | "stage"
  | "at"
  | "note"
  | "gclid"
  | "value";

/** Header aliases (cs / en), diacritic-folded before lookup. Order-independent. */
const COL: Record<string, Col> = {
  // name
  name: "name", jmeno: "name", "jmeno a prijmeni": "name", prijmeni: "name", kontakt: "name",
  "full name": "name", "first name": "name", klient: "name",
  // email
  email: "email", "e-mail": "email", mail: "email", "emailova adresa": "email", "work email": "email",
  // phone
  phone: "phone", telefon: "phone", tel: "phone", mobil: "phone", "phone number": "phone", cislo: "phone",
  // company
  company: "company", firma: "company", spolecnost: "company", organizace: "company", "company name": "company",
  // attribution
  source: "source", zdroj: "source", kanal: "source", channel: "source", puvod: "source",
  campaign: "campaign", kampan: "campaign", "utm campaign": "campaign", utm_campaign: "campaign",
  // lifecycle
  stage: "stage", faze: "stage", status: "stage", stav: "stage",
  date: "at", datum: "at", at: "at", created: "at", vytvoreno: "at", "datum vzniku": "at", submitted: "at",
  // free text
  note: "note", poznamka: "note", zprava: "note", message: "note", text: "note", popis: "note", enquiry: "note",
  // WP W3-C — the two columns that make a row exportable as an offline conversion.
  // `gclid` is the Google click id an offline conversion is MATCHED on (without it a
  // qualified lead is exportable to Sklik's hand sheet and to nothing else), `value`
  // the deal amount in CZK. Both optional; an absent value stays null, never 0.
  gclid: "gclid", "google click id": "gclid", "click id": "gclid", "id kliknuti": "gclid",
  value: "value", hodnota: "value", "deal value": "value", cena: "value", castka: "value",
};

/** Stage-value aliases → PipelineStage. A superset of lead-quality's STAGE map
 *  because the pipeline vocabulary has the two states the funnel enum cannot
 *  express (working, lost/disqualified). */
const STAGE: Record<string, PipelineStage> = {
  new: "new", novy: "new", "novy lead": "new", nove: "new", poptavka: "new",
  working: "working", rozpracovano: "working", "v reseni": "working", inprogress: "working", contacted: "working", kontaktovano: "working",
  lead: "lead", leady: "lead",
  qualified: "qualified", kvalifikovany: "qualified", sql: "qualified", mql: "qualified", kvalifikace: "qualified",
  opportunity: "opportunity", opp: "opportunity", prilezitost: "opportunity", nabidka: "opportunity", jednani: "opportunity", proposal: "opportunity",
  won: "won", uzavreno: "won", vyhrano: "won", "closed won": "won", closedwon: "won", zakazka: "won", zaplaceno: "won",
  lost: "lost", ztraceno: "lost", prohrano: "lost", "closed lost": "lost", closedlost: "lost", odmitnuto: "lost",
  disqualified: "disqualified", diskvalifikovano: "disqualified", spam: "disqualified", nevhodne: "disqualified",
};

/** Bound for a Google click id. Real gclids run ~50–100 characters; the cap is a
 *  sanity bound on an untrusted cell, not a format claim. */
const GCLID_MAX = 200;

export interface CsvParseOptions {
  projectId: string;
  /** the id of THIS import — half of `${importId}:${rowIndex}`, the idempotency key
   *  that makes re-uploading the same file a no-op rather than a duplicate storm */
  importId: string;
  /** ISO stamp used for rows without a parseable date */
  receivedAt: string;
  /** attribution source when a row carries none */
  defaultSource?: string;
}

export interface CsvParseResult {
  events: LeadEvent[];
  /** rows read from the file (excluding the header) */
  rows: number;
  /** rows dropped for having no usable identity — surfaced, never silent */
  skipped: number;
}

/** Parse a pasted / uploaded contact CSV into `LeadEvent`s. Tolerant: a header row
 *  maps columns by cs/en name; a row with neither email, phone nor name is dropped
 *  (it cannot become a person). Input order preserved, capped at LEAD_ROW_CAP. */
export function parseContactCsv(text: string, opts: CsvParseOptions): CsvParseResult {
  const records = parseCsvRecords(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (records.length === 0) return { events: [], rows: 0, skipped: 0 };

  const header = records[0]!.map((c) => normalizeForSearch(c).trim());
  const mapped = header.map((h) => COL[h]);
  const hasHeader = mapped.some(Boolean);
  // Without a header we assume the documented default order. The two WP W3-C
  // columns are APPENDED (9, 10) so a headerless file written against the previous
  // order still maps every column it had to the same place.
  const idx: Record<Col, number> = { name: 0, email: 1, phone: 2, company: 3, source: 4, campaign: 5, stage: 6, at: 7, note: 8, gclid: 9, value: 10 };
  if (hasHeader) {
    for (const k of Object.keys(idx) as Col[]) idx[k] = -1;
    mapped.forEach((col, i) => {
      if (col && idx[col] === -1) idx[col] = i;
    });
  }

  const cell = (row: string[], col: Col): string => {
    const i = idx[col];
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };

  const body = records.slice(hasHeader ? 1 : 0);
  const events: LeadEvent[] = [];
  let skipped = 0;
  for (let r = 0; r < body.length && events.length < LEAD_ROW_CAP; r++) {
    const row = body[r]!;
    const name = clampText(cell(row, "name"), NAME_MAX);
    const email = clampText(cell(row, "email"), EMAIL_MAX);
    const phone = clampText(cell(row, "phone"), PHONE_MAX);
    if (!name && !email && !phone) {
      skipped += 1;
      continue;
    }
    const at = parseLeadDate(cell(row, "at"));
    const occurredAt = at ? `${at}T00:00:00.000Z` : opts.receivedAt;
    const externalId = `${opts.importId}:${r}`;
    const note = clampText(cell(row, "note"), NOTE_MAX);
    const company = clampText(cell(row, "company"), NAME_MAX);
    const campaign = clampText(cell(row, "campaign"), NAME_MAX);
    const stageCell = cell(row, "stage");
    const source = clampText(cell(row, "source"), NAME_MAX) ?? opts.defaultSource ?? "import";
    // WP W3-C: the click id rides ATTRIBUTION (it is an attribution fact, and
    // `Attribution.gclid` has existed unused since the entity layer shipped); the
    // deal value rides `raw`, because it belongs to the row, not to the person.
    const gclid = clampText(cell(row, "gclid"), GCLID_MAX);
    const valueCell = cell(row, "value");

    events.push({
      id: `csv-${opts.importId}-${r}`,
      projectId: opts.projectId,
      connectorId: "csv",
      externalId,
      kind: "row",
      occurredAt,
      identity: { ...(name ? { name } : {}), ...(email ? { email } : {}), ...(phone ? { phone } : {}) },
      ...(note ? { text: note } : {}),
      attribution: {
        source,
        ...(campaign ? { campaign } : {}),
        ...(gclid ? { gclid } : {}),
        connectorId: "csv",
        externalId,
      },
      // `raw` carries the columns that are not part of the identity/attribution
      // contract but that the applier may still honour — the declared stage above
      // all, so an imported "won" row is not filed as a fresh enquiry, and the deal
      // value the conversion ledger uploads.
      ...(company || stageCell || valueCell
        ? {
            raw: {
              ...(company ? { company } : {}),
              ...(stageCell ? { stage: stageCell } : {}),
              ...(valueCell ? { value: valueCell } : {}),
            },
          }
        : {}),
      receivedAt: opts.receivedAt,
      status: "pending",
    });
  }
  return { events, rows: body.length, skipped };
}

/** The pipeline stage a CSV row declares, when it declares one. Exported so the
 *  ingest route can honour an export that already carries a stage instead of
 *  parking every imported row in "new". Pure. */
export function stageFromCsvCell(raw: string | undefined): PipelineStage | undefined {
  if (!raw) return undefined;
  return STAGE[normalizeForSearch(raw).trim()];
}

export const CSV_META: ConnectorMeta = {
  id: "csv",
  label: "CSV / vložený text",
  labelEn: "CSV / paste",
  channel: "leads",
  modes: ["poll"],
  needsOAuth: false,
  needsToken: false,
  needsConfig: false,
  implemented: true,
  caveat:
    "Jednorázový import — Adamant se nikam nepřipojuje a nic nestahuje sám. Opakovaný import stejného souboru nic nezduplikuje.",
  caveatEn:
    "A one-off import — Adamant connects to nothing and pulls nothing on its own. Re-importing the same file duplicates nothing.",
};

/** The CSV connector is "pull by paste": its `pull` normalises the text handed to
 *  it on `opts.payload`, so it satisfies the universal polling baseline without
 *  pretending to reach out to a provider. */
export const csvConnector: LeadConnector = {
  meta: CSV_META,
  configured: () => true,
  async pull(_conn: StoredLeadConnection, opts: PullOptions): Promise<PullResult> {
    const payload = opts.payload as { text?: string; importId?: string } | undefined;
    const text = typeof payload?.text === "string" ? payload.text : "";
    if (!text.trim()) return { events: [] };
    const parsed = parseContactCsv(text, {
      projectId: opts.projectId,
      importId: payload?.importId ?? String(opts.now.getTime()),
      receivedAt: opts.now.toISOString(),
    });
    return { events: parsed.events.slice(0, opts.limit) };
  },
};
