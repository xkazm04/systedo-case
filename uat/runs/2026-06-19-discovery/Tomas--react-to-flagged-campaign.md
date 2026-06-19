# Journal — Tomáš, "react to flagged campaign"

_First-person, in-character. Driven on the now-unblocked authed module `/app/demo-eshop/kampane` (LOCAL_DB + DEV_AUTH)._

**Why I'm here:** Start of the day. I want to catch anything leaking spend overnight and act on the worst first before I touch budgets.

**Land on the campaigns module.** Empty state — "Zatím žádná data z Google Ads", with a Synchronizovat button. Fine, I click it. ~1s later the whole portfolio loads: KPI strip (Náklady 387 580 Kč, ROAS 4,0×, PNO 25,0 % vs cíl 18 %), a type breakdown, and a banner: **"6 kampaní vyžaduje pozornost · 3 kritických · 3 ke sledování."** Good — first thing I see is that it needs attention and roughly how much. *I know what to do.*

**Which ones, worst first?** The table lists 7 rows, but the order is by spend, not by severity — the two top rows are only "Sledovat", and the first **Kritické** (Demand Gen, ROAS 1,8×) is sitting at row 3, below warnings. That's backwards for me: I act on criticals first. There's a "Seřadit podle priority" button, so I click it — *now* the three criticals (Demand Gen, Display, Video) float to the top, worst-first. It works, but I shouldn't have had to ask. (→ F-T1)

**Why is Demand Gen critical?** The badge says "Kritické" but the *reason* isn't in the row — I'd have to hover the badge to see it. I happen to know ROAS 1,8× against an 18% PNO target is bleeding, but the table makes me trust the badge without showing its working. (→ F-T2)

**Trust-but-verify with the AI eval.** I hit Analyzovat on Demand Gen. A live timer counts up… and up. **~104 seconds** later the report lands. That's a long time to stare at one campaign — I've got five more criticals/warnings and I'm not waiting ten minutes. (→ F-T3) But the report itself is the best I've seen: score **20/100 "Podvýkonné"**, and it's grounded in *my* numbers — "ROAS 1,8× = 32 % cíle", "PNO 56,6 % = 3,1× nad cílem", "spotřebovává 17 % nákladů, generuje 7,5 % hodnoty", "6. místo ze 7", "CTR 0,78 %", even "průměrná hodnota konverze 860 Kč (116 117/135)". Four concrete next steps with priority (cut budget 60–70 %, tighten audiences, interim Target ROAS 3,5×, refresh creatives). It names the model, says 0 $ (subscription), and lets me see the exact prompt. **I'd act on this.**

**One thing nags me.** The sync stamp now reads "Google Ads · ukázková data · **před 8 hodinami**" — but I synced two minutes ago. Eight hours? If I can't trust the freshness label, I half-doubt the data. (→ F-T4)

**Did I get my job done?** Yes. I saw it needed attention, got worst-first, understood why, got a grounded eval I'd act on, and know exactly what to do with Demand Gen (cut 60–70 %, ~39–46k to redeploy). **Status: Completed-with-friction** — the friction is the cost-sorted default, the hover-only reasons, and the 100s wait, not the substance.
