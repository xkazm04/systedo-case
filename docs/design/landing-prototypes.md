# Landing explorations — September 2026

Requested as three working alternatives to the public landing page. Open
`/prototypes` for the comparison gallery; the existing `/` remains the incumbent.
These are intentionally unindexed previews, not a conversion experiment or a
claim that any direction performs better.

| Preview | Visual idea | Try it |
| --- | --- | --- |
| `/prototypes/orbit` | A website has gravity: a lit spherical object surrounded by free discovery channels. Dark, spacious, dimensional. | Switch free channels, content and campaigns to change the map. |
| `/prototypes/studio` | A small brand becomes a coordinated creative campaign. Warm paper, oversized editorial type, CSS product packaging. | Select citrus, berry or mint to recolor the poster, packaging and content examples. |
| `/prototypes/signal` | An opportunity becomes a clear next action. Sage surfaces, structured typography, an interactive product console. | Select a channel; switch to drafts or sample performance. |

All three lead to the existing `/kanaly-zdarma` flow and link sign-in to `/app`.
Their sample plans, scores, creative brand and performance values are illustrative;
none reads tenant data, runs AI, publishes content or spends money. Artwork is
made in CSS and SVG, with no external assets or added dependencies. Both Czech
and English use the existing locale provider.

Prototype colors are scoped CSS custom properties. Each art direction retains its
intended palette in either system theme. Animation is finite, pausable and disabled
for reduced motion and printing. Shared site navigation/footer are suppressed only
on these preview routes, which provide their own chrome and keep the root main
landmark and skip link.

Validation: `tests/landing-prototypes.spec.ts` exercises all routes at desktop and
phone widths, the three demos, locale switching, noindex metadata and reduced
motion. Local screenshots can be captured from the running development server;
they are review evidence rather than production dependencies.

The shared footer now explicitly waits for a request before calculating its year.
The new public routes exposed an existing Next.js prerender error at that date
read, even when the client chrome gate ultimately hides the footer.

Validation on 2026-09-09: production build and TypeScript pass; repository lint
has zero errors (175 existing warnings). All five prototype browser tests and
the incumbent homepage smoke test pass. The full unit suite completes with
4,126 passed, three skipped and five failures in untouched policy declarations,
the gate sandbox's missing package manifest, the guidance line budget and the
model-candidate registry. Those baseline failures still prevent a green CI run.
The client-directive scanner hang discovered during verification is fixed in a
separate commit, with regression cases; no gate was bypassed or relaxed.
