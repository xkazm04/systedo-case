/** Pure report-config shapes + constants — no I/O, no firebase. Split out of
 *  `report-config.ts` so the client settings UI can import the cadence list and
 *  types without pulling firebase-admin into the browser bundle. */

export type ReportCadence = "off" | "weekly" | "monthly";
export const REPORT_CADENCES: ReportCadence[] = ["off", "weekly", "monthly"];

export const REPORT_CADENCE_LABELS: Record<ReportCadence, string> = {
  off: "Vypnuto",
  weekly: "Týdně (pondělí)",
  monthly: "Měsíčně (1. den)",
};

export interface ReportConfig {
  /** white-label brand name shown on the report (empty = account name) */
  brandName: string;
  /** accent colour (hex) for the report header (empty = default brand) */
  accentColor: string;
  /** who the scheduled report is emailed to (empty = the account owner) */
  recipients: string[];
  cadence: ReportCadence;
  /** UTC day (YYYY-MM-DD) a scheduled report was last sent — double-send guard */
  lastSentDay?: string;
}

export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  brandName: "",
  accentColor: "",
  recipients: [],
  cadence: "off",
};
