# Landing explorations — September 2026

Orbit is the remaining alternative to the public landing page. Open
`/prototypes` for its preview entry; the existing `/` remains the incumbent.
These are intentionally unindexed previews, not a conversion experiment or a
claim that any direction performs better.

| Preview | Visual idea | Try it |
| --- | --- | --- |
| `/prototypes/orbit` | A website has gravity: a lit spherical object surrounded by free discovery channels. Dark, spacious, dimensional. | Switch free channels, content and campaigns to change the map. |

Orbit leads to the existing `/kanaly-zdarma` flow and links sign-in to `/app`.
Its sample plan is illustrative;
it does not read tenant data, run AI, publish content or spend money. Artwork is
made in CSS and SVG, with no external assets or added dependencies. Both Czech
and English use the existing locale provider.

Prototype colors are scoped CSS custom properties. Each art direction retains its
intended palette in either system theme. Animation is finite, pausable and disabled
for reduced motion and printing. Shared site navigation/footer are suppressed only
on these preview routes, which provide their own chrome and keep the root main
landmark and skip link.

Validation: `tests/landing-prototypes.spec.ts` exercises all routes at desktop and
phone widths, the Orbit demo, locale switching, noindex metadata and reduced
motion. Local screenshots can be captured from the running development server;
they are review evidence rather than production dependencies.

The shared footer now explicitly waits for a request before calculating its year.
The new public routes exposed an existing Next.js prerender error at that date
read, even when the client chrome gate ultimately hides the footer.

Initial three-variant validation on 2026-09-09: production build and TypeScript pass; repository lint
has zero errors (175 existing warnings). All five prototype browser tests and
the incumbent homepage smoke test pass. The full unit suite completes with
4,126 passed, three skipped and five failures in untouched policy declarations,
the gate sandbox's missing package manifest, the guidance line budget and the
model-candidate registry. Those baseline failures still prevent a green CI run.
The client-directive scanner hang discovered during verification is fixed in a
separate commit, with regression cases; no gate was bypassed or relaxed.

Studio and Signal were removed at the owner's request after visual review found
the directions underwhelming. Their routes, components, styles, gallery entries
and dedicated tests are removed. Locale-switch coverage now exercises Orbit.
Orbit remains available while the owner prepares a more specific direction for
the next prototype; this cleanup introduces no new design.
