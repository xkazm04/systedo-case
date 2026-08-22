/** The contract every AGGREGATE overview (Segmenty, Krajina, …) renders against.
 *  The module owns the data seam (`useLeadSummary`) and the hand-off back into the
 *  database view; an overview never fetches contacts page-by-page on its own. */
import type { ContactSummary } from "@/lib/leads/summary";
import type { ContactQuery } from "@/lib/leads/store-filter";

export interface AggregateViewProps {
  projectId: string;
  summary: ContactSummary | null;
  /** false ⇒ the summary describes the seeded sample, not the project's data */
  live: boolean;
  loading: boolean;
  /** total contacts the summary was computed over (bounded scan; see `summary.capped`) */
  total: number;
  /** Drill down: switch to the database view with this filter applied. */
  onOpenInTable: (query: Partial<ContactQuery>) => void;
}
