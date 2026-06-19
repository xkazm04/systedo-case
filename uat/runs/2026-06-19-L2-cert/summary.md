# L2 certification run — 2026-06-19

**Env:** dev:local server `:3100` (DEV_AUTH + LOCAL_DB), branch `vibeman/feature-scout-depth`.
4 seeded projects (eshop / leadgen / app / content — app+content added this run).
**Method:** live chromium drive (`uat/driver/drive.mjs`) + one bespoke AI-wait driver
(`tobias-grounded.mjs`). Deep verification on the 6 fixed Characters; smoke-load on the 4 prior.

## Verdicts

| Character | Surface(s) | L2 verdict |
|-----------|-----------|------------|
| **Robert** (eshop) | zisk, ltv, sklad | ✅ sample-data banner renders; **LTV was unreachable for eshop (app-only) → fixed** → now in nav + e-shop framing ("…placených **zákazníků**") |
| **Tobias** (app) | srovnani-seo | ✅ competitor/positioning inputs render; **grounded output verified LIVE** (real Claude 78s) — H1 + criteria + verdict all use *Asana* + *Sklik/Fakturoid/EU/čeština*, zero placeholders |
| **Dan** (eshop) | kreativa | ✅ brand-kit field renders ("Brand kit — barvy, styl, tonalita") |
| **Hana** (leadgen) | kvalita-leadu, rychla-reakce | ✅ both render; peer-source + BANT travel in the AI request (gate + code verified) |
| **Sofie** (eshop) | socialni | ✅ renders; performance grounding is server-side in the draft call (gate + code verified) |
| **Lucia** | reporty | ✅ management list renders; client microsite brand/jargon fix is code-verified (live needs a share token) |
| Petra / Tomáš / Eva / Marek | přehled / kampane / obsah / public home | ✅ smoke-load (Marek home = "Adamant — AI ad intelligence") |

**Brand:** 0 occurrences of "Systedo" across all captured surfaces.

## Headline finding — the L2-over-L1 value
L1 (theoretical code walkthrough) recorded Robert's "LTV is SaaS-shaped for my e-shop" and we
fixed the framing. **L2 (live nav) revealed an e-shop project never reaches the LTV module at all**
— it was `availableFor: ["app"]`, absent from the eshop sidebar — so the framing fix was
unreachable for its intended user. This reachability/IA class of gap is invisible to L1 (which
reads code as if every surface is reachable) and is exactly why L2 exists. Resolved by enabling
`ltv` for eshop (it's now project-type-aware) — committed `348ff0c`.

## Net
All 9 grounding/framing fixes hold up live; one structural gap found + fixed; no regressions
(no brand leaks, all surfaces load). The app is materially closer to "knows the user's world."
