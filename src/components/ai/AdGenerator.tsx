"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useOptionalProject } from "@/lib/projects/context";
import { Bolt, Check, Close, Download, Gauge, Layers, Refresh, Sparkles } from "@/components/icons";
import { downloadText, toCsv } from "@/lib/export";
import { buildAdsEditorAdSheet, buildAdsEditorKeywordSheet } from "@/lib/ads-editor";
import { sampleRsaCombo } from "@/lib/rsa-combos";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  AD_LIMITS,
  PLATFORM_LABELS,
  PLATFORMS,
  TONE_LABELS,
  TONES,
  type AdRequest,
  type AdResult,
  type Platform,
  type Tone,
} from "@/lib/ai-types";
import {
  AD_STRENGTH_ORDER,
  computeAdStrength,
  getAdStrengthLabel,
  type AdStrength,
  type AdStrengthFactor,
  type AdStrengthRating,
} from "@/lib/ad-strength";
import { useAiTool } from "./useAiTool";
import { usePersistedForm } from "./usePersistedForm";
import {
  CharCount,
  CopyButton,
  Field,
  Group,
  LoadingTimer,
  PromptDisclosure,
  RefineBar,
  ResultMeta,
  TimeoutState,
  ToolEmpty,
  ToolError,
  inputClass,
} from "./primitives";

const T = {
  cs: {
    adStrengthTitle: "Síla inzerátu",
    adStrengthAriaLabel: "Síla inzerátu: {rating}, {score} ze 100",
    rsaPreviewLabelGoogle: "Náhled inzerátu (RSA)",
    sklikPreviewLabel: "Náhled inzerátu (Sklik)",
    rsaPreviewBadge: "Ukázková kombinace",
    sklikPreviewBadge: "Stylizovaná ukázka (Seznam)",
    sklikAdTag: "Reklama",
    rsaSponsoredLine: "Sponzorováno · Mionelo",
    rsaTitleFallback: "Nadpis inzerátu",
    rsaDescFallback: "Popisek inzerátu se zobrazí tady.",
    rsaNextCombo: "Další kombinace",
    rsaNextComboTitle: "Zobrazit další kombinaci nadpisů a popisků, jak je Google střídá",
    rsaComboOf: "Kombinace {i}/{n}",
    rsaComboAssets: "nadpisy č. {h} · popisky č. {d}",
    formHeading: "Zadání kampaně",
    fillExample: "Vyplnit ukázku",
    fieldProduct: "Produkt nebo služba",
    fieldBenefits: "Hlavní výhody / USP",
    fieldAudience: "Cílová skupina",
    fieldPlatform: "Platforma",
    fieldTone: "Tón komunikace",
    submitGenerating: "Generuji…",
    submitGenerate: "Vygenerovat inzeráty",
    emptyTitle: "Návrh inzerátů se zobrazí tady",
    emptyBody: "Vyplňte zadání kampaně vlevo a nechte Gemini vygenerovat nadpisy, popisky a klíčová slova — rovnou s kontrolou limitů znaků pro Google Ads i Sklik.",
    emptyHint: "Tip: zkuste „Vyplnit ukázku“ a klikněte na Vygenerovat.",
    abNamePlaceholder: "Název A/B testu",
    abSaving: "Ukládám…",
    abSaveVariant: "Uložit variantu",
    abSaveTitleHover: "Uložit jako variantu A/B testu pro porovnání",
    abAdded: "Přidáno do A/B testu",
    abAdd: "Přidat do A/B testu",
    downloadCsvTitle: "Stáhnout všechny texty jako CSV",
    downloadCsv: "Stáhnout CSV",
    downloadEditorCsvTitle:
      "Stáhnout CSV připravené pro import do Google Ads Editoru — jeden řádek inzerátu (Headline 1–15, Description 1–4) + druhý soubor s klíčovými slovy",
    downloadEditorCsv: "CSV pro Ads Editor",
    groupHeadlines: "Nadpisy",
    groupDescriptions: "Popisky",
    groupCallouts: "Odznaky",
    groupLongHeadline: "Dlouhý nadpis",
    groupKeywords: "Klíčová slova",
    groupKeywordsHint: "{n} návrhů",
    rationaleTitle: "Proč právě takhle",
    csvColType: "Typ",
    csvColText: "Text",
    csvColCharCount: "Počet znaků",
    csvHeadlineType: "Nadpis",
    csvDescType: "Popisek",
    csvCalloutType: "Odznak",
    csvLongHeadlineType: "Dlouhý nadpis",
    csvKeywordType: "Klíčové slovo",
    copyAllHeadlines: "NADPISY:",
    copyAllDescriptions: "POPISKY:",
    copyAllCallouts: "ODZNAKY:",
    copyAllLongHeadline: "DLOUHÝ NADPIS:",
    copyAllKeywords: "KLÍČOVÁ SLOVA:",
    maxCharsHint: "max {n} znaků",
    placeholderProduct: "Kešu ořechy natural, 500 g",
    placeholderBenefits: "100% natural, bez soli a oleje, skladem, doprava zdarma…",
    placeholderAudience: "Lidé se zájmem o zdravý životní styl",
    editableHint: "Texty lze upravovat přímo v řádcích — síla inzerátu, náhled i exporty se přepočítají živě.",
    undoEdits: "Vrátit vygenerované",
    undoEditsTitle: "Zahodit ruční úpravy a vrátit původní vygenerované texty",
  },
  en: {
    adStrengthTitle: "Ad strength",
    adStrengthAriaLabel: "Ad strength: {rating}, {score} out of 100",
    rsaPreviewLabelGoogle: "Ad preview (RSA)",
    sklikPreviewLabel: "Ad preview (Sklik)",
    rsaPreviewBadge: "Sample combination",
    sklikPreviewBadge: "Stylized sample (Seznam)",
    sklikAdTag: "Ad",
    rsaSponsoredLine: "Sponsored · Mionelo",
    rsaTitleFallback: "Ad headline",
    rsaDescFallback: "Ad description will appear here.",
    rsaNextCombo: "Next combination",
    rsaNextComboTitle: "Show another headline/description combination, the way Google rotates them",
    rsaComboOf: "Combination {i}/{n}",
    rsaComboAssets: "headlines {h} · descriptions {d}",
    formHeading: "Campaign brief",
    fillExample: "Fill example",
    fieldProduct: "Product or service",
    fieldBenefits: "Main benefits / USP",
    fieldAudience: "Target audience",
    fieldPlatform: "Platform",
    fieldTone: "Communication tone",
    submitGenerating: "Generating…",
    submitGenerate: "Generate ads",
    emptyTitle: "Ad drafts will appear here",
    emptyBody: "Fill in the campaign brief on the left and let Gemini generate headlines, descriptions and keywords — with character-limit validation for Google Ads and Sklik.",
    emptyHint: "Tip: try “Fill example” and click Generate.",
    abNamePlaceholder: "A/B test name",
    abSaving: "Saving…",
    abSaveVariant: "Save variant",
    abSaveTitleHover: "Save as an A/B test variant for comparison",
    abAdded: "Added to A/B test",
    abAdd: "Add to A/B test",
    downloadCsvTitle: "Download all texts as CSV",
    downloadCsv: "Download CSV",
    downloadEditorCsvTitle:
      "Download a CSV ready for Google Ads Editor import — one ad row (Headline 1–15, Description 1–4) + a second file with keywords",
    downloadEditorCsv: "Ads Editor CSV",
    groupHeadlines: "Headlines",
    groupDescriptions: "Descriptions",
    groupCallouts: "Callouts",
    groupLongHeadline: "Long headline",
    groupKeywords: "Keywords",
    groupKeywordsHint: "{n} suggestions",
    rationaleTitle: "Why this approach",
    csvColType: "Type",
    csvColText: "Text",
    csvColCharCount: "Character count",
    csvHeadlineType: "Headline",
    csvDescType: "Description",
    csvCalloutType: "Callout",
    csvLongHeadlineType: "Long headline",
    csvKeywordType: "Keyword",
    copyAllHeadlines: "HEADLINES:",
    copyAllDescriptions: "DESCRIPTIONS:",
    copyAllCallouts: "CALLOUTS:",
    copyAllLongHeadline: "LONG HEADLINE:",
    copyAllKeywords: "KEYWORDS:",
    maxCharsHint: "max {n} chars",
    placeholderProduct: "Cashew nuts natural, 500 g",
    placeholderBenefits: "100% natural, no salt or oil, in stock, free shipping…",
    placeholderAudience: "People interested in a healthy lifestyle",
    editableHint: "Texts are editable right in the rows — ad strength, the preview and exports recompute live.",
    undoEdits: "Restore generated",
    undoEditsTitle: "Discard manual edits and restore the original generated texts",
  },
} as const;

/** Per-rating accents for the strength meter — red → orange → blue → green. */
const RATING_STYLE: Record<AdStrengthRating, { bar: string; chip: string }> = {
  poor: { bar: "bg-negative", chip: "bg-negative-soft text-negative" },
  average: { bar: "bg-coral-500", chip: "bg-coral-soft text-coral-600" },
  good: { bar: "bg-brand-500", chip: "bg-brand-50 text-brand-accent" },
  excellent: { bar: "bg-positive", chip: "bg-positive-soft text-positive" },
};

/** Tiny status glyph for a strength factor: met / partial / not met. */
function FactorIcon({ status }: { status: AdStrengthFactor["status"] }) {
  if (status === "pass") return <Check width={15} height={15} className="text-positive" />;
  if (status === "fail") return <Close width={14} height={14} className="text-negative" />;
  return <span className="block h-1.5 w-1.5 rounded-full bg-coral-500" aria-hidden />;
}

/** Google-Ads-style "Ad Strength" rating with a segmented meter and the factor
 *  checklist that tells the user what would push the set toward Excellent. */
function AdStrengthMeter({
  strength,
  locale,
  t,
}: {
  strength: AdStrength;
  locale: import("@/lib/format").SupportedLocale;
  t: ReturnType<typeof useT<keyof typeof T.cs>>;
}) {
  const filled = AD_STRENGTH_ORDER.indexOf(strength.rating) + 1;
  const style = RATING_STYLE[strength.rating];
  const ratingLabel = getAdStrengthLabel(strength.rating, locale);
  return (
    <div data-testid="ad-strength" className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge width={18} height={18} className="text-brand-600" />
          <h3 className="text-sm font-semibold text-navy-800">{t("adStrengthTitle")}</h3>
        </div>
        <span className={`pill ${style.chip}`}>{ratingLabel}</span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div
          className="flex flex-1 gap-1.5"
          role="img"
          aria-label={t("adStrengthAriaLabel", { rating: ratingLabel, score: strength.score })}
        >
          {AD_STRENGTH_ORDER.map((rating, i) => (
            <span
              key={rating}
              className={`h-2 flex-1 rounded-full transition-colors ${i < filled ? style.bar : "bg-navy-100"}`}
            />
          ))}
        </div>
        <span className="tnum shrink-0 text-xs font-medium text-muted">{strength.score}/100</span>
      </div>

      <ul className="mt-4 space-y-2">
        {strength.factors.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center">
              <FactorIcon status={f.status} />
            </span>
            <span className="min-w-0 text-sm leading-snug">
              <span className="font-medium text-navy-800">{f.label}</span>
              <span className="text-muted"> — {f.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** URL-path seed for the preview: lowercase, de-accented, dash-joined. */
const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28)
    .replace(/-+$/g, "");

/** Live ad preview, branched by platform: a Google SERP mock (up to 3 headlines
 *  joined with " | ") or a stylized Seznam.cz result for Sklik (2 headlines
 *  joined per the kombinovaná reklama, the labelled "Reklama" tag beside the
 *  URL) — so the platform toggle changes the rendered ad, not just a caption.
 *  Both platforms actually SERVE rotating combinations, so the preview rotates
 *  too: "Další kombinace" advances a deterministic sampler over the non-blank
 *  assets (combination 1 = the classic first-slice view), with the shown asset
 *  numbers tying the combo back to the numbered rows below. */
function RsaPreview({
  headlines,
  descriptions,
  pathSeed,
  platform,
  t,
}: {
  headlines: string[];
  descriptions: string[];
  pathSeed: string;
  platform: Platform;
  t: ReturnType<typeof useT<keyof typeof T.cs>>;
}) {
  // Raw click count; the sampler wraps it modulo the combination count, so a
  // re-generation shrinking the asset lists can never point out of range.
  const [combo, setCombo] = useState(0);
  const sample = sampleRsaCombo(headlines, descriptions, combo);
  const desc = sample.descriptions.join(" ");
  const path = slugify(pathSeed);
  const isGoogle = platform === "google";
  // Google composes up to 3 headlines; Sklik's kombinovaná reklama joins 2.
  const title = isGoogle ? sample.headlines.join(" | ") : sample.headlines.slice(0, 2).join(" – ");
  const shownHeadlineNumbers = isGoogle
    ? sample.headlineNumbers
    : sample.headlineNumbers.slice(0, 2);
  return (
    <div data-testid="rsa-preview" className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {isGoogle ? t("rsaPreviewLabelGoogle") : t("sklikPreviewLabel")}
        </p>
        <span className="pill bg-navy-50 text-muted">
          {isGoogle ? t("rsaPreviewBadge") : t("sklikPreviewBadge")}
        </span>
      </div>
      {isGoogle ? (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-onyx text-[13px] font-semibold text-white"
              aria-hidden
            >
              M
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-xs font-semibold text-navy-800">{t("rsaSponsoredLine")}</p>
              <p className="truncate text-xs text-serp-url">
                www.mionelo.cz{path ? ` › ${path}` : ""}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xl leading-snug text-serp-link">{title || t("rsaTitleFallback")}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-navy-600">
            {desc || t("rsaDescFallback")}
          </p>
        </div>
      ) : (
        /* Stylized Seznam.cz result: title first, then the labelled "Reklama"
           tag beside the URL — the shape Sklik ads render in Seznam search. */
        <div className="mt-3" data-testid="sklik-preview">
          <p className="text-xl leading-snug text-serp-link">{title || t("rsaTitleFallback")}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="shrink-0 rounded border border-positive/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-positive">
              {t("sklikAdTag")}
            </span>
            <p className="min-w-0 truncate text-xs text-serp-url">
              www.mionelo.cz{path ? ` › ${path}` : ""}
            </p>
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-navy-600">
            {desc || t("rsaDescFallback")}
          </p>
        </div>
      )}
      {sample.count > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <p className="tnum min-w-0 text-xs text-muted">
            {t("rsaComboOf", { i: sample.index + 1, n: sample.count })} ·{" "}
            {t("rsaComboAssets", {
              h: shownHeadlineNumbers.join("·"),
              d: sample.descriptionNumbers.join("·"),
            })}
          </p>
          <button
            type="button"
            onClick={() => setCombo((c) => c + 1)}
            title={t("rsaNextComboTitle")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
          >
            <Refresh width={13} height={13} />
            {t("rsaNextCombo")}
          </button>
        </div>
      )}
    </div>
  );
}

/** TextRow's editable sibling: same over-limit tinting, counter and copy button,
 *  but the text itself is an input/textarea — an over-limit (red) or weak asset
 *  can be fixed in place and Ad Strength, the RSA preview and every export
 *  recompute live instead of the feedback loop dying at copy-out. */
function EditableTextRow({
  text,
  limit,
  label,
  multiline,
  onChange,
}: {
  text: string;
  limit: number;
  label: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const over = text.length > limit;
  const fieldClass =
    "min-w-0 flex-1 bg-transparent text-sm text-navy-800 outline-none placeholder:text-muted";
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-within:border-brand-400 ${
        over ? "border-negative/40 bg-negative-soft" : "border-line bg-surface"
      }`}
    >
      {multiline ? (
        <textarea
          value={text}
          rows={2}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldClass} resize-none`}
        />
      ) : (
        <input
          type="text"
          value={text}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass}
        />
      )}
      <CharCount value={text.length} limit={limit} />
      <CopyButton text={text} label="" />
    </li>
  );
}

const EXAMPLE: AdRequest = {
  product: "Kešu ořechy natural, 500 g",
  benefits:
    "100% natural bez soli a oleje, čerstvé z pravidelného obratu zásob, výhodné rodinné balení, BIO varianta skladem",
  audience: "Lidé se zájmem o zdravý životní styl a kvalitní svačiny, domácí pekaři",
  platform: "google",
  tone: "pratelsky",
};

const EMPTY: AdRequest = { product: "", benefits: "", audience: "", platform: "google", tone: "vecny" };

/** Structural guard for a restored draft — a stale/foreign shape is dropped
 *  rather than hydrated into the form (enum fields must stay valid). */
const isAdForm = (v: unknown): v is AdRequest => {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.product === "string" &&
    typeof o.benefits === "string" &&
    typeof o.audience === "string" &&
    (PLATFORMS as readonly string[]).includes(o.platform as string) &&
    (TONES as readonly string[]).includes(o.tone as string)
  );
};

export default function AdGenerator({
  seed,
  onVariantSaved,
}: {
  /** cross-tool handoff (brief → ads): prefills the form via the initial value.
   *  The parent re-mounts this component with a new `key` per handoff, so a
   *  fresh seed applies through the lazy init — same pattern as the keyword →
   *  brief bridge in ContentBriefGenerator. */
  seed?: Partial<AdRequest> | null;
  onVariantSaved?: () => void;
} = {}) {
  const t = useT(T);
  const { locale } = useLocale();
  const { status: authStatus } = useSession();
  const project = useOptionalProject();
  const pid = project?.id;
  // The campaign brief is the panel's most expensive input (5 fields) — persist
  // it like the result already is, so a stray reload doesn't cost the typing.
  // Keyed per project so drafts don't leak between workspaces. A live seed WINS
  // over a stored draft (skipRestore) and immediately writes through as the new
  // draft — mirroring the brief tool's seed-vs-draft precedence.
  const [form, setForm] = usePersistedForm<AdRequest>(
    pid ? `ads.${pid}` : "ads",
    seed ? { ...EMPTY, ...seed } : EMPTY,
    { skipRestore: Boolean(seed), validate: isAdForm }
  );
  const { status, data, error, retryIn, upgradeUrl, timedOut, run, reset, history, activeIndex, restore, refine, canRefine, expectedMs } =
    useAiTool<AdResult>("ads");
  const [abName, setAbName] = useState("");
  const [abState, setAbState] = useState<"idle" | "saving" | "saved">("idle");
  const [abOpen, setAbOpen] = useState(false);

  const set = <K extends keyof AdRequest>(key: K, value: AdRequest[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canSubmit =
    form.product.trim().length >= 2 &&
    form.benefits.trim().length >= 2 &&
    form.audience.trim().length >= 2 &&
    status !== "loading";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) run({ ...form });
  }

  const generated = data?.result ?? null;
  // The editable working copy of the generation. Everything downstream — the
  // strength meter, the RSA preview, copy-all, the CSV export and the A/B save —
  // reads `r` (edited ?? generated), so an in-place fix recomputes them all.
  const [edited, setEdited] = useState<AdResult | null>(null);
  // Re-seed the editable copy whenever a generation arrives or a history entry
  // is restored (same external-sync pattern as the hook's storage restore).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdited(generated);
  }, [generated]);
  const r = edited ?? generated ?? undefined;
  const dirty = useMemo(
    () =>
      generated !== null && edited !== null && JSON.stringify(edited) !== JSON.stringify(generated),
    [edited, generated]
  );
  const editList = (key: "headlines" | "descriptions" | "callouts", index: number, value: string) =>
    setEdited((e) => (e ? { ...e, [key]: e[key].map((x, i) => (i === index ? value : x)) } : e));
  const editLongHeadline = (value: string) =>
    setEdited((e) => (e ? { ...e, longHeadline: value } : e));

  const strength = useMemo(() => (r ? computeAdStrength(r, locale) : null), [r, locale]);

  // Save the current ad as a variant of an A/B test (same name → same test).
  const saveVariant = async () => {
    if (!r || !strength || abState === "saving") return;
    const name = abName.trim() || form.product.trim() || "A/B test";
    setAbState("saving");
    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ad: r, strength: strength.score, projectId: pid }),
      });
      if (!res.ok) {
        setAbState("idle");
        return;
      }
      setAbState("saved");
      setAbOpen(false);
      onVariantSaved?.();
    } catch {
      setAbState("idle");
    }
  };

  // Export every generated asset (with its character count) as a CSV the user can
  // paste straight into Google Ads / Sklik or a sheet — beyond copy-to-clipboard.
  const exportAdsCsv = () => {
    if (!r) return;
    const rows: (string | number)[][] = [];
    r.headlines.forEach((h) => rows.push([t("csvHeadlineType"), h, h.length]));
    r.descriptions.forEach((d) => rows.push([t("csvDescType"), d, d.length]));
    r.callouts.forEach((c) => rows.push([t("csvCalloutType"), c, c.length]));
    if (r.longHeadline) rows.push([t("csvLongHeadlineType"), r.longHeadline, r.longHeadline.length]);
    r.keywords.forEach((k) => rows.push([t("csvKeywordType"), k, k.length]));
    downloadText(
      `systedo-inzeraty-${slugify(form.product) || "kampan"}.csv`,
      toCsv([t("csvColType"), t("csvColText"), t("csvColCharCount")], rows)
    );
  };

  // Ads-Editor-ready export: the same edited assets transposed into the one-row
  // Headline 1..15 / Description 1..4 shape Ads Editor imports, plus a keyword
  // sheet — "download → import → launch" instead of hand-transposing the listing.
  // One click saves both files (ad + keywords); campaign/ad-group seed from the
  // brief's product, the path/URL from the same slug the preview shows.
  const exportAdsEditorCsv = () => {
    if (!r) return;
    const name = form.product.trim() || "Kampan";
    const path1 = slugify(r.keywords[0] ?? form.product);
    const seed = {
      campaign: name,
      adGroup: name,
      path1,
      finalUrl: `https://www.mionelo.cz/${path1}`,
    };
    const fileSeed = slugify(form.product) || "kampan";
    const ad = buildAdsEditorAdSheet(r, seed);
    downloadText(`systedo-ads-editor-${fileSeed}.csv`, toCsv(ad.headers, ad.rows));
    const kw = buildAdsEditorKeywordSheet(r.keywords, seed);
    if (kw.rows.length > 0) {
      downloadText(`systedo-ads-editor-${fileSeed}-klicova-slova.csv`, toCsv(kw.headers, kw.rows));
    }
  };

  const copyAllText = r
    ? [
        t("copyAllHeadlines"),
        ...r.headlines.map((h) => `- ${h}`),
        `\n${t("copyAllDescriptions")}`,
        ...r.descriptions.map((d) => `- ${d}`),
        `\n${t("copyAllCallouts")}`,
        ...r.callouts.map((c) => `- ${c}`),
        `\n${t("copyAllLongHeadline")}\n- ${r.longHeadline}`,
        `\n${t("copyAllKeywords")}\n${r.keywords.join(", ")}`,
      ].join("\n")
    : "";

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
      <form onSubmit={onSubmit} className="card space-y-5 p-6 lg:sticky lg:top-24">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-navy-800">{t("formHeading")}</h2>
          <button
            type="button"
            onClick={() => setForm(EXAMPLE)}
            className="text-xs font-semibold text-brand-accent hover:text-brand-800"
          >
            {t("fillExample")}
          </button>
        </div>

        <Field label={t("fieldProduct")} htmlFor="product">
          <input
            id="product"
            type="text"
            value={form.product}
            onChange={(e) => set("product", e.target.value)}
            placeholder={t("placeholderProduct")}
            className={inputClass}
          />
        </Field>

        <Field label={t("fieldBenefits")} htmlFor="benefits">
          <textarea
            id="benefits"
            rows={3}
            value={form.benefits}
            onChange={(e) => set("benefits", e.target.value)}
            placeholder={t("placeholderBenefits")}
            className={`${inputClass} resize-none`}
          />
        </Field>

        <Field label={t("fieldAudience")} htmlFor="audience">
          <input
            id="audience"
            type="text"
            value={form.audience}
            onChange={(e) => set("audience", e.target.value)}
            placeholder={t("placeholderAudience")}
            className={inputClass}
          />
        </Field>

        <Field label={t("fieldPlatform")}>
          <div className="inline-flex w-full rounded-lg bg-navy-50 p-1">
            {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set("platform", p)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  form.platform === p ? "bg-surface text-navy-800 shadow-card" : "text-muted"
                }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t("fieldTone")}>
          <div className="grid grid-cols-2 gap-2">
            {TONES.map((tone: Tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => set("tone", tone)}
                className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                  form.tone === tone
                    ? "border-brand-400 bg-brand-50 text-brand-800"
                    : "border-line text-muted hover:border-navy-200"
                }`}
              >
                {TONE_LABELS[tone]}
              </button>
            ))}
          </div>
        </Field>

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          {status === "loading" ? (
            <>
              <Sparkles width={17} height={17} className="animate-pulse" />
              {t("submitGenerating")}
            </>
          ) : (
            <>
              <Bolt width={17} height={17} />
              {t("submitGenerate")}
            </>
          )}
        </button>
      </form>

      <div className="min-w-0">
        {status === "idle" && (
          <ToolEmpty
            icon={Sparkles}
            title={t("emptyTitle")}
            body={t("emptyBody")}
            hint={t("emptyHint")}
          />
        )}
        {status === "loading" && <LoadingTimer expectedMs={expectedMs} />}
        {status === "error" &&
          (timedOut ? (
            <TimeoutState onRetry={reset} />
          ) : (
            <ToolError message={error ?? ""} onRetry={reset} retryIn={retryIn} upgradeUrl={upgradeUrl} />
          ))}

        {status === "done" && r && data && (
          <div className="animate-fade-up space-y-5">
            <ResultMeta
              meta={data.meta}
              copyAllText={copyAllText}
              history={history}
              activeIndex={activeIndex}
              onRestore={restore}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-xs text-muted">{t("editableHint")}</p>
              <div className="flex flex-wrap items-center gap-2">
              {dirty && (
                <button
                  type="button"
                  onClick={() => setEdited(generated)}
                  title={t("undoEditsTitle")}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
                >
                  <Refresh width={14} height={14} />
                  {t("undoEdits")}
                </button>
              )}
              {authStatus === "authenticated" && (
                <>
                  {abOpen ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={abName}
                        onChange={(e) => setAbName(e.target.value)}
                        placeholder={form.product || t("abNamePlaceholder")}
                        aria-label={t("abNamePlaceholder")}
                        className="w-44 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs text-navy-800"
                      />
                      <button
                        type="button"
                        onClick={saveVariant}
                        disabled={abState === "saving"}
                        className="inline-flex items-center gap-1 rounded-pill bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                      >
                        {abState === "saving" ? t("abSaving") : t("abSaveVariant")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAbOpen(true)}
                      title={t("abSaveTitleHover")}
                      className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
                    >
                      {abState === "saved" ? (
                        <>
                          <Check width={14} height={14} /> {t("abAdded")}
                        </>
                      ) : (
                        <>
                          <Layers width={14} height={14} /> {t("abAdd")}
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={exportAdsCsv}
                title={t("downloadCsvTitle")}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                <Download width={14} height={14} />
                {t("downloadCsv")}
              </button>
              <button
                type="button"
                onClick={exportAdsEditorCsv}
                title={t("downloadEditorCsvTitle")}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                <Download width={14} height={14} />
                {t("downloadEditorCsv")}
              </button>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
              <RsaPreview
                headlines={r.headlines}
                descriptions={r.descriptions}
                pathSeed={r.keywords[0] ?? form.product}
                platform={form.platform}
                t={t}
              />
              {strength && <AdStrengthMeter strength={strength} locale={locale} t={t} />}
            </div>

            <Group title={t("groupHeadlines")} hint={t("maxCharsHint", { n: AD_LIMITS.headline })}>
              <ul className="space-y-2">
                {r.headlines.map((h, i) => (
                  <EditableTextRow
                    key={i}
                    text={h}
                    limit={AD_LIMITS.headline}
                    label={`${t("groupHeadlines")} ${i + 1}`}
                    onChange={(v) => editList("headlines", i, v)}
                  />
                ))}
              </ul>
            </Group>

            <Group title={t("groupDescriptions")} hint={t("maxCharsHint", { n: AD_LIMITS.description })}>
              <ul className="space-y-2">
                {r.descriptions.map((d, i) => (
                  <EditableTextRow
                    key={i}
                    text={d}
                    limit={AD_LIMITS.description}
                    label={`${t("groupDescriptions")} ${i + 1}`}
                    multiline
                    onChange={(v) => editList("descriptions", i, v)}
                  />
                ))}
              </ul>
            </Group>

            <div className="grid gap-5 sm:grid-cols-2">
              <Group title={t("groupCallouts")} hint={t("maxCharsHint", { n: AD_LIMITS.callout })}>
                <ul className="space-y-2">
                  {r.callouts.map((c, i) => (
                    <EditableTextRow
                      key={i}
                      text={c}
                      limit={AD_LIMITS.callout}
                      label={`${t("groupCallouts")} ${i + 1}`}
                      onChange={(v) => editList("callouts", i, v)}
                    />
                  ))}
                </ul>
              </Group>

              <Group title={t("groupLongHeadline")} hint={t("maxCharsHint", { n: AD_LIMITS.longHeadline })}>
                <ul>
                  <EditableTextRow
                    text={r.longHeadline}
                    limit={AD_LIMITS.longHeadline}
                    label={t("groupLongHeadline")}
                    multiline
                    onChange={editLongHeadline}
                  />
                </ul>
              </Group>
            </div>

            <Group title={t("groupKeywords")} hint={t("groupKeywordsHint", { n: r.keywords.length })}>
              <div className="flex flex-wrap gap-2">
                {r.keywords.map((k, i) => (
                  <span key={i} className="rounded-pill bg-navy-50 px-3 py-1.5 text-sm text-navy-700">
                    {k}
                  </span>
                ))}
              </div>
            </Group>

            {r.rationale && (
              <div className="rounded-card border border-brand-200 bg-brand-50 p-5">
                <p className="text-sm font-semibold text-brand-800">{t("rationaleTitle")}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-700">{r.rationale}</p>
              </div>
            )}

            {/* Iterate on the last generation with a steering note (server-side
                refine) instead of mangling the form to bust the response cache. */}
            {canRefine && <RefineBar onRefine={refine} />}

            <PromptDisclosure prompt={data.meta.prompt} />
          </div>
        )}
      </div>
    </div>
  );
}
