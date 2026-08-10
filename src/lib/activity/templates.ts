/** Event-title templates for the Activity timeline, per locale. Deliberately NOT a
 *  TDict: these take params (`{area}`, `{name}`, `{value}`) and are looked up by the
 *  seeded events' `tmpl` key, so they go through `interpolate`, not `useT`. Lifted
 *  out of ActivityModule.tsx to keep that component near the 200-LOC bar; the
 *  component still owns its own TDict for its chrome. Framework-free. */
export const ACTIVITY_TEMPLATES: Record<"cs" | "en", Record<string, string>> = {
  cs: {
    review_reply_drafted: "AI navrhla odpověď na recenzi ({area})",
    review_flagged: "Recenze označena majiteli ({area})",
    review_published: "Odpověď na recenzi publikována ({area})",
    map_rank_up: "Pozice v mapě vzrostla na #{value} ({area})",
    map_rank_down: "Pozice v mapě klesla na #{value} ({area})",
    keyword_top3: "Klíčové slovo se posunulo do TOP 3 ({area})",
    post_published: "Příspěvek publikován: {name}",
    budget_shift: "Přesun rozpočtu do kampaně {name}",
    sync: "Synchronizace dat z Google Ads",
    location_needs: "Pobočka {area} vyžaduje pozornost",
    coverage_gap: "Nalezena mezera v pokrytí ({area})",
    integration_action: "Napojení vyžaduje dokončení: {name}",
  },
  en: {
    review_reply_drafted: "AI drafted a reply to a review ({area})",
    review_flagged: "Review flagged for owner ({area})",
    review_published: "Review reply published ({area})",
    map_rank_up: "Map pack rank rose to #{value} ({area})",
    map_rank_down: "Map pack rank slipped to #{value} ({area})",
    keyword_top3: "Keyword moved into the TOP 3 ({area})",
    post_published: "Post published: {name}",
    budget_shift: "Budget moved to campaign {name}",
    sync: "Synced data from Google Ads",
    location_needs: "Location {area} needs attention",
    coverage_gap: "Coverage gap found ({area})",
    integration_action: "Integration needs finishing: {name}",
  },
};
