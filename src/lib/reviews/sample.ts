/** Illustrative public reviews for a local-SEO project's Review Inbox — a fuller
 *  dataset than the Lokální module's four-review reputation panel. Seeded off the
 *  project id so it stays stable across requests and varies per project; spread
 *  across the project's localities with a positive-skewed rating mix. Real seam:
 *  a reviews API (Google Business Profile). Framework-free. */
import type { Project } from "@/lib/projects/types";
import type { Locality } from "@/lib/catalog/offering";
import { seed01 } from "@/lib/project-data/seed";

export interface ReviewItem {
  id: string;
  author: string;
  area: string;
  /** star rating 1–5 */
  rating: number;
  text: string;
  /** age in days (0 = today) — the inbox sorts on this */
  daysAgo: number;
}

const AUTHORS = [
  "Jana K.", "Petr M.", "Lucie N.", "Tomáš R.", "Markéta S.", "Lukáš V.",
  "Eva H.", "Martin D.", "Kristýna P.", "Ondřej B.", "Veronika T.", "Filip Z.",
  "Barbora L.", "Jakub Č.", "Tereza M.", "Adam K.", "Nikola V.", "David S.",
];

const TEXT: Record<"positive" | "neutral" | "negative", string[]> = {
  positive: [
    "Naprostá spokojenost. Vstřícný přístup, vše proběhlo rychle a profesionálně. Můžu jen doporučit.",
    "Objednání online bez problémů, přišli na čas a odvedli skvělou práci. Určitě se vrátím.",
    "Perfektní komunikace a férové ceny. Personál ochotný a příjemný, děkuji!",
    "Skvělá zkušenost od začátku do konce. Vše vysvětlili srozumitelně a bez zbytečného čekání.",
    "Doporučuji všem v okolí — rychle, kvalitně a s úsměvem.",
  ],
  neutral: [
    "Celkově dobré, jen objednací termín byl o něco delší, než jsem čekal. Práce ale v pořádku.",
    "Slušný přístup, výsledek fajn. Trochu chaos na recepci, ale nic zásadního.",
    "Průměrná zkušenost — nic špatného, ale ani nic, co by mě nadchlo.",
  ],
  negative: [
    "Domluvený termín nikdo nedodržel a na telefonu se nikdo neozval. Velké zklamání.",
    "Přišli o dvě hodiny později a nezavolali předem. Komunikace vázla.",
    "Cena nakonec vyšla výrazně výš, než bylo domluveno. Nepříjemné překvapení.",
  ],
};

/** Positive-skewed rating from a 0..1 roll (≈ 55% 5★, 20% 4★, 12% 3★, 8% 2★, 5% 1★). */
function ratingFrom(roll: number): number {
  if (roll > 0.45) return 5;
  if (roll > 0.25) return 4;
  if (roll > 0.13) return 3;
  if (roll > 0.05) return 2;
  return 1;
}

function bandKey(rating: number): "positive" | "neutral" | "negative" {
  return rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative";
}

/** Generate the project's review inbox — newest first. */
export function reviewsForProject(project: Project, localities: Locality[], count = 18): ReviewItem[] {
  const areas = localities.length > 0 ? localities.map((l) => l.name) : ["Praha"];
  return Array.from({ length: count }, (_, i) => {
    const s = (k: string) => seed01(`${project.id}:review:${i}:${k}`);
    const rating = ratingFrom(s("rating"));
    const pool = TEXT[bandKey(rating)];
    return {
      id: `rev-${i}`,
      author: AUTHORS[Math.floor(s("auth") * AUTHORS.length)],
      area: areas[Math.floor(s("area") * areas.length)],
      rating,
      text: pool[Math.floor(s("text") * pool.length)],
      daysAgo: Math.floor(s("days") * 60),
    };
  }).sort((a, b) => a.daysAgo - b.daysAgo);
}
