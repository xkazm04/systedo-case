/** Direction 2 — the currency stops lying. Pure label-resolution seam
 *  (src/lib/campaigns/currency.ts): a CZK / unknown / un-captured account formats
 *  BYTE-IDENTICALLY to the base fmtCZK, a captured non-CZK account relabels the
 *  amount in its own currency (no conversion). Plus the conversionsValue round-once
 *  fix in the Google + Sklik daily aggregation. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BASE_CURRENCY,
  isBaseCurrency,
  isForeignCurrency,
  normalizeCurrency,
  resolveMoneyFormatter,
  resolveSignedMoneyFormatter,
} from "@/lib/campaigns/currency";
import { fmtCZK, fmtSignedCZK, LOCALES } from "@/lib/format";
import { mapRowsToDailySeries } from "@/lib/google/ads";
import { SklikClient } from "@/lib/sklik/client";
import { fetchSklikSeries } from "@/lib/sklik/adapter";

test("normalizeCurrency: canonical alpha-3, else null", () => {
  assert.equal(normalizeCurrency("czk"), "CZK");
  assert.equal(normalizeCurrency("  eur "), "EUR");
  assert.equal(normalizeCurrency("EUR"), "EUR");
  assert.equal(normalizeCurrency(""), null);
  assert.equal(normalizeCurrency("EURO"), null); // 4 letters → junk
  assert.equal(normalizeCurrency("12"), null);
  assert.equal(normalizeCurrency(undefined), null);
  assert.equal(normalizeCurrency(null), null);
});

test("base / foreign classification: unknown counts as base (no regression)", () => {
  assert.equal(BASE_CURRENCY, "CZK");
  for (const base of ["CZK", "czk", null, undefined, "junk", ""]) {
    assert.equal(isBaseCurrency(base), true, `${base} → base`);
    assert.equal(isForeignCurrency(base), false);
  }
  for (const foreign of ["EUR", "usd", "PLN"]) {
    assert.equal(isBaseCurrency(foreign), false, `${foreign} → foreign`);
    assert.equal(isForeignCurrency(foreign), true);
  }
});

test("resolveMoneyFormatter: base currency returns the base fn UNCHANGED (byte-identical)", () => {
  const base = fmtCZK;
  // For CZK / unknown, the exact same function reference is returned → identical bytes.
  for (const c of ["CZK", null, undefined, "nonsense"]) {
    const f = resolveMoneyFormatter({ currency: c, intlLocale: "cs-CZ", base });
    assert.equal(f, base, `${c} → base fn`);
    assert.equal(f(1234), base(1234));
  }
});

test("resolveMoneyFormatter: a non-CZK account relabels in its own currency, no rescale", () => {
  const f = resolveMoneyFormatter({
    currency: "EUR",
    intlLocale: LOCALES.cs.intlLocale,
    base: fmtCZK,
  });
  const out = f(1234);
  // The AMOUNT is unchanged (no conversion) — 1234 still appears; only the symbol is €.
  assert.match(out, /1\s?234/);
  assert.ok(out.includes("€") || /EUR/i.test(out), `expected a euro label, got "${out}"`);
  assert.ok(!out.includes("Kč"), "must not label euros as koruny");
  // Non-finite → the shared em-dash placeholder.
  assert.equal(f(NaN), "—");
});

test("resolveSignedMoneyFormatter: base currency returns fmtSignedCZK UNCHANGED", () => {
  for (const c of ["CZK", null, undefined, "nonsense"]) {
    const f = resolveSignedMoneyFormatter({ currency: c, intlLocale: "cs-CZ", base: fmtSignedCZK });
    assert.equal(f, fmtSignedCZK, `${c} → base fn`);
    assert.equal(f(38000), fmtSignedCZK(38000));
    assert.equal(f(-85000), fmtSignedCZK(-85000));
  }
});

test("resolveSignedMoneyFormatter: a non-CZK account signs its own currency, no rescale", () => {
  const f = resolveSignedMoneyFormatter({
    currency: "EUR",
    intlLocale: LOCALES.cs.intlLocale,
    base: fmtSignedCZK,
  });
  const gain = f(1234);
  assert.match(gain, /\+/); // explicit plus for a gain
  assert.match(gain, /1\s?234/); // amount unchanged (no conversion)
  assert.ok(gain.includes("€") || /EUR/i.test(gain), `expected euro label, got "${gain}"`);
  assert.ok(!gain.includes("Kč"), "must not label euros as koruny");
  // A loss uses the true minus U+2212 and the abs amount.
  const loss = f(-1234);
  assert.ok(loss.includes("−"), `expected true minus, got "${loss}"`);
  // Rounds before signing → a sub-unit delta that displays as zero carries no sign.
  assert.ok(!/[+−]/.test(f(0.2)), `zero-rounding delta must be unsigned, got "${f(0.2)}"`);
  assert.equal(f(NaN), "—");
});

test("Google daily aggregation rounds conversionsValue ONCE at the day total", () => {
  // Two rows on the same day, each 0.5 → raw sum 1.0 → round once = 1. Rounding
  // per row (the old bug) would give round(0.5)+round(0.5) = 2.
  const rows = [
    { segments: { date: "2026-07-10" }, metrics: { conversionsValue: 0.5, costMicros: 0, clicks: 1, impressions: 10, conversions: 0.5 } },
    { segments: { date: "2026-07-10" }, metrics: { conversionsValue: 0.5, costMicros: 0, clicks: 1, impressions: 10, conversions: 0.5 } },
  ];
  const series = mapRowsToDailySeries(rows);
  assert.equal(series.length, 1);
  assert.equal(series[0].conversionValue, 1); // round-once, NOT 2
});

test("Sklik daily aggregation rounds conversionValue ONCE at the day total", async () => {
  const transport = {
    async call(method, params) {
      if (method === "client.loginByToken") return { session: "s", status: 200 };
      if (method === "stats.campaigns") {
        assert.equal(params[1]?.granularity, "daily");
        return {
          session: "s",
          status: 200,
          report: [
            { campaignId: 1, stats: [{ date: "2026-07-10", money: 0, clicks: 1, impressions: 5, conversions: 0.5, conversionValue: 0.5 }] },
            { campaignId: 2, stats: [{ date: "2026-07-10", money: 0, clicks: 1, impressions: 5, conversions: 0.5, conversionValue: 0.5 }] },
          ],
        };
      }
      throw new Error(`unexpected ${method}`);
    },
  };
  const series = await fetchSklikSeries(new SklikClient(transport, "tok"), "7d");
  assert.equal(series.length, 1);
  assert.equal(series[0].conversionValue, 1); // round-once across the two campaigns
});
