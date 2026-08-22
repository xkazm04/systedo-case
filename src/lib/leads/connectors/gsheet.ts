/** Google Sheets connector — STUB (`implemented: false`).
 *
 *  This is the connector that should ship FIRST (design.md §C4.6), because the
 *  Picker + `drive.file` + `spreadsheets.values.get` path needs **no verification,
 *  no CASA assessment and no user cap** — `drive.file` is a NON-SENSITIVE scope.
 *  What is not built yet is the interactive half: the Google Picker must run in the
 *  browser with the user signed in (`setOAuthToken` + `setAppId`), which is a UI +
 *  OAuth-client phase, not a data-layer one.
 *
 *  Shipping it as an honest `implemented: false` row — rather than a button that
 *  fails — is the `inventory/providers.ts` posture the repo already uses.
 *
 *  When it IS built: the cursor is `${revisionId}:${lastRowIndex}`, the externalId
 *  is `${fileId}:${rowIndex}` plus a row hash (so an edited row re-ingests but an
 *  unchanged one does not), and the row → identity mapping is exactly
 *  `csv.ts#parseContactCsv` fed from `spreadsheets.values.get`. Per-file access
 *  granted at pick time persists in practice but is NOT a documented guarantee —
 *  store the file id and handle 404/403 by re-prompting the Picker. */
import type { ConnectorMeta, LeadConnector, PullOptions, PullResult, StoredLeadConnection } from "./types";

export const GSHEET_META: ConnectorMeta = {
  id: "gsheet",
  label: "Google Sheets",
  labelEn: "Google Sheets",
  channel: "leads",
  modes: ["poll"],
  needsOAuth: true,
  needsToken: true,
  needsConfig: true,
  implemented: false,
  caveat:
    "Připravujeme. Napojení poběží přes Google Picker a oprávnění drive.file — Adamant uvidí jen ten jeden list, který mu sami vyberete, a nic jiného na vašem Disku. Do té doby použijte export do CSV.",
  caveatEn:
    "Coming soon. The connection will run through the Google Picker and the drive.file scope — Adamant sees only the one sheet you pick and nothing else on your Drive. Until then, export to CSV.",
};

export const gsheetConnector: LeadConnector = {
  meta: GSHEET_META,
  /** Never claims to be configured: the OAuth client + Picker flow do not exist yet. */
  configured: () => false,
  async pull(_conn: StoredLeadConnection, _opts: PullOptions): Promise<PullResult> {
    // Honest, non-throwing: the sweep records a skipped connector, not a failure.
    return { events: [], error: "gsheet-not-implemented" };
  },
};
