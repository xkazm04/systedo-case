# Next-gen landing — the pattern library

**What this is.** Four videos and one repository about "GPT-6 Astra web design", read for what
survives once the model worship and the plugin referral links are removed. It is a library of
*information-distribution* patterns, not a motion vocabulary: the first attempt at a rebuild
(`docs/ship/2026-09-08-landing-motion-rebuild.md`) had the motion and still read as a reading
journal, because motion is not what separates a designed page from a formatted one.

**What it is for.** Briefing a landing page — ours or a client's — so the page has a strategy
before it has a hero. Three variants at `/lp/{story,exhibit,instrument}` each apply ONE strategy
from this library, on purpose and unblended, so a review can attribute what works. The review
sheet is `/lp`; the decision date is 2026-10-08.

**Sources** (transcripts pulled 2026-09-08; timestamps are into each video):

| Key | Video / repo | What it is actually about |
| --- | --- | --- |
| V1 | `THjxEpbCQsA` "Astra Is the Undisputed KING of Website Design" | a five-technique motion menu, a motion budget, sequencing, a verification loop |
| V2 | `dQudtNmDjJw` "OpenAI GPT 6 Astra Web Design is Insane!" (Codex Community) | one-shot tests; the one usable idea is the redesign criterion |
| V3 | `h2MjhbwVKLk` "GPT-6 Astra FINALLY Kills AI Website Slop" (Nate Herk) | layering as depth, audience fit, inspiration sources, iteration |
| V4 | `QhmhUgccaS0` "Build a $10K Website With GPT Astra" (Bart Slodyczka) | **the visual story** — the one genuinely new idea in the set — and a six-step process |
| R1 | `MartinDelophy/awesome-gpt-6-astra` | a games list; the extractable parts are its own showcase site (`website/`, a dark sidebar gallery with a design-QA record) and Orbital Garden (`works/orbital-garden`, an exhibition-hall presentation of an interactive artefact) |

---

## The twelve patterns

### P1 · The visual story spine — *time*

> "It's a visual story of your product … as you walk into the store, the purpose of you visiting
> this place is because you want to leave with something. So here you're walking in to buy a
> watch, and you want to leave with it on your wrist." — V4 00:50–01:03

The scroll is one narrative from first sight to the outcome the visitor wants to leave with.
Bart's three: a watch explodes into components and reassembles on a wrist; dough is thrown,
baked, boxed; a jacket is zoomed into its fibres, rained on, and pulled back to a hiker on a
summit (V4 00:38–01:32, 04:42–05:12). Every section is a scene of the **same protagonist**;
copy is captions, one line each. The page has a beginning and an end, so it does not need a
FAQ to stop.

*How Bart gets it:* a generated video clip cut into frames and scrubbed by scroll (V4 06:29–06:42).
*How we get it without video:* a pinned stage whose state is set by scroll position; every
transition is CSS on layered planes. Same effect, no runtime, no 40 MB asset.

### P2 · Layering is depth

> "The layering adds so much depth because you can clearly see how the text is on a different
> layer than the background image, which is on a different layer than the bike, which is on a
> different layer than the rocks. And that's what makes it feel super immersive without being
> over the top." — V3 02:27–02:40

Every hero and most bands are three or four planes — text, subject, background, foreground —
each moving at its own rate or not at all. Flat is the first thing that reads as slop. The
brand already has the planes (`hero-far`, `hero-mass`, `hero-veil` in `public/brand/monolith/`).

### P3 · Open on the thing itself

> "The work opens directly on the interactive sculpture — do not show a marketing page or a
> start button first." — R1, `works/orbital-garden/PROMPT.md` (translated)

The product is the hero. No pitch above the artefact, no eyebrow-headline-subhead-CTA stack
before the visitor has seen what they came for. For a product with a live demo dataset, the
demo *is* the opening frame.

### P4 · Information as exhibit — *space*

From Orbital Garden's presentation layer (R1 `index.html` `<style>`): a display headline at
`clamp(66px, 6.7vw, 110px)` with `line-height .91` and `-.058em` tracking, a mono eyebrow with
a glowing dot, an italic **specimen number** in the corner (`.specimen .number`), intro copy
capped at 280px, thin `--line` rules, a `feTurbulence` noise overlay at 4.5%. From the astra
showcase (`website/src/styles.css`): a 12-column gallery where the first card spans 7, the
second 5 and the rest 4 — asymmetry as the rhythm, cards that are one image + one line + one
caption.

Facts are displayed as **numbered specimens in a gallery**, not narrated. A KPI is a plate; a
ranked list is a histogram; a capability matrix is a matrix. Paragraphs over two lines are a
failure of this pattern.

*House translation:* `DESIGN.md` allows Geist Sans and Geist Mono only, so the italic serif
specimen number becomes **Geist Mono** — which `docs/roadmap/landing-variants-retired.md`
already lists as the un-harvested "mono for measurement" idea.

### P5 · Name the technique; one technique per band

> "You need to know five animation techniques because you can't ask for something that you
> can't name." — V1 02:42–02:47
> "Only one of them is ever moving at a time. That whole page is what agencies charge the most
> for." — V1 05:50–05:58

Layered parallax · scroll-trigger text reveal · scroll-driven rotation · cursor tracking ·
stacking cards. Assign each to exactly one band. Implemented here as the `.mono-*` family in
`src/app/globals.css` and `src/components/motion/PointerLight.tsx`. Four of five are CSS
timelines and hydrate nothing.

### P6 · Sequence: footage → body → numbers, and numbers one at a time

> "Footage goes in first and then the body goes in second, then specs go in last. Show me what
> it sees, then show me what it is, then show me the numbers. Most product sites do that
> backwards." — V1 08:25–08:38
> "Four numbers fading in together would read as a table, but arriving separately they start
> to read as calm." — V1 09:05–09:11

### P7 · Pain · Person · Promise

> "The other element of AI slop is when it feels like you're looking at something that is
> meant for someone else. If you're a 70-year-old man looking for medication and you're
> scrolling through a 3D world, you're going to be like, this is the worst thing I've ever
> seen." — V3 07:43–07:55

Before any visual decision: who is in pain, who they are, what is promised. **Adamant's
person** is a Czech e-shop owner or a small agency operator who has spent on ads without a
clear return and cannot afford an agency. The promise is *ads that hold up, and free channels
first*. That rules out maximalism and rules in depth, clarity and evidence.

### P8 · References, not adjectives — and fuse three

> "Always give it some inspiration, not instructions. 'Make it look premium' means nothing to
> the model." — V1 06:56–07:10
> "Godly design … 21st.dev … Awwwards organized by category, because an e-commerce site needs
> to look different than a restaurant site." — V3 06:36–07:34
> Bart: three Pinterest screenshots → "fuse them into our own unique design" — V4 10:29–11:21

A brief is three concrete references, each with the one thing to take from it. For this repo
the first reference is always `DESIGN.md`; the other two are chosen per variant and named in
its composer's header.

### P9 · The mock is the source of truth, then design-QA

From R1 `website/AGENTS.md` and `website/design-qa.md`: the selected generated image is
"the source of truth for layout, component anatomy, density, spacing, color, typography,
visible content, and hierarchy"; then the implementation is compared at the SAME viewport
(1536×1024, 1:1, no chrome), findings are graded P0/P1/P2, interaction is verified case by
case, and mobile is rendered separately. Verification is a written record.

Ours: `docs/design/qa/` — one sheet per variant.

### P10 · Mobile is a second story, not a squeeze

> "That's most likely going to be reproduced as a separate clip specifically for this
> viewport." — V4 14:10–14:16

The phone gets its own composition of the same story. A pinned stage becomes 60svh with
captions under it; a gallery becomes a catalogue with a sticky index; a sidebar becomes a
segmented control. Never "the desktop, narrower".

### P11 · One accent, everywhere it matters

> "The orange on the person with the jacket, the V is orange and also this is orange. It's a
> nice consistent style between the clothing, the buttons and the brand icon." — V4 14:54–15:08

The accent is the through-line of the story. `DESIGN.md` already rations teal to exactly this
job — the CTA, the live line, the lit edge — and the variants must not invent a second one.

### P12 · The redesign wins when the product is clearer

> "This actually is much clearer, and the information about what the website actually is …
> comes across a lot better than any other redesign." — V2 05:52–06:02

The only criterion V2 applies that survives: after the redesign, can a stranger say what the
product does faster? Decoration that does not clarify is a loss, however good it looks.

---

## The diagnosis this library yields

A **reading journal** — the state of the shipped homepage and of the first rebuild — is a page
where P1, P3 and P4 are absent at once: no protagonist, the pitch before the artefact, and
facts narrated instead of displayed. Motion (P5) does not fix it. Assets (P2) do not fix it.
It is fixed by choosing a distribution strategy, and there are three:

| Strategy | Axis | Patterns | Variant |
| --- | --- | --- | --- |
| **Story** | time | P1 P2 P6 P10 | `/lp/story` — one project, from a URL to a running account, on a pinned stage |
| **Exhibit** | space | P3 P4 P8 P11 | `/lp/exhibit` — every fact a numbered specimen in an asymmetric gallery |
| **Instrument** | interaction | P3 P7 P12 P5 | `/lp/instrument` — pick a business type, the page re-composes |

Each variant is pure by design. A blend would make the review unable to say which strategy
carried it.

## How to brief the next one

1. **P7 first.** Write the person, the pain, the promise in three lines.
2. **P8.** Name three references and the one thing taken from each. `DESIGN.md` is always one.
3. **Pick the axis** — time, space or interaction — and say why for this person.
4. **P5.** Assign one technique per band, and write "still" against the bands that get none.
5. **P6.** Order it: what it sees, what it is, the numbers.
6. **P3.** Decide what the visitor sees before the first word. If the answer is a headline,
   go back to step 3.
7. **P10.** Sketch the phone as its own composition.
8. **P9.** Write the QA sheet before calling it done.

## What the sources do NOT teach, stated so nobody reads it in

- Nothing in them measures conversion. V3 says so outright (01:06–01:14). These are patterns
  for being *seen as designed*; whether that converts is the review's question, not the library's.
- The turntable / frame-sequence idea (V1) does not transfer to a text-to-image pipeline;
  see the superseded ship note for why a CSS 3D object was used instead.
- "One-shot" claims (V2, R1) are about the tools' demos, not about a method. Every good
  result in these sources was iterated (V3 00:52: "I've iterated on this like 15 times").
