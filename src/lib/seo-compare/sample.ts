/** Illustrative high-intent comparison queries for an app/SaaS project — the
 *  "alternative / vs / pricing / review" space where intent (and conversion) is
 *  highest. Real-integration seam: Search Console + a keyword tool. */

export type CompareIntent = "alternative" | "vs" | "pricing" | "review";

export interface CompareQuery {
  query: string;
  intent: CompareIntent;
  /** monthly search volume */
  volume: number;
  /** SEO difficulty 0..100 */
  difficulty: number;
  /** current SERP position, or null if not ranking */
  rank: number | null;
}

export const SAMPLE_QUERIES: CompareQuery[] = [
  { query: "asana alternativa", intent: "alternative", volume: 1300, difficulty: 38, rank: null },
  { query: "notion alternativa zdarma", intent: "alternative", volume: 1700, difficulty: 35, rank: null },
  { query: "nástroj cena", intent: "pricing", volume: 2400, difficulty: 25, rank: 6 },
  { query: "crm pro malé firmy cena", intent: "pricing", volume: 1900, difficulty: 40, rank: null },
  { query: "monday.com vs trello", intent: "vs", volume: 880, difficulty: 42, rank: 14 },
  { query: "clickup vs nástroj", intent: "vs", volume: 540, difficulty: 30, rank: null },
  { query: "nástroj vs jira", intent: "vs", volume: 610, difficulty: 33, rank: 11 },
  { query: "nástroj recenze", intent: "review", volume: 720, difficulty: 20, rank: 8 },
  { query: "nejlepší projektový nástroj", intent: "alternative", volume: 2900, difficulty: 55, rank: 22 },
];
