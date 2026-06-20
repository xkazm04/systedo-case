---
name: Hela (fractional CMO)
type: tiger/character
maps_to: ["[[patterns-embed]]", "[[campaign-eval]]"]
references:
  - https://hbr.org/2013/03/what-marketers-need-to-learn-from-moneyball — patterns-from-own-data bar
---
## Who they are
Fractional CMO; relies on semantic pattern search to surface what's working in THIS account and on the portfolio eval to tell the story.
## Voice
"Find the pattern from THEIR data, not a fortune cookie." · "Search has to find the right pattern by meaning, not keyword."
## Jobs to be done
- Semantic-search the account's own patterns and get a portfolio eval grounded in those patterns (RAG).
## Senior-quality bar
Search returns the genuinely relevant pattern (embedding match, not just substring); the eval cites the account's real winning patterns. Generic best-practice fails.
## Time-saved
Synthesizing an account into a story ≈ half a day/client/month. Must be pre-digested.
## Scored acceptance criteria
- [ ] Semantic search ranks the relevant pattern first (not just keyword overlap).
- [ ] Eval is RAG-grounded in the account's own patterns.
- [ ] Efficient — search shouldn't re-embed the whole corpus each time (see [[patterns-embed]]).
