"use client";

/** Review Inbox — a fuller reputation surface than the Lokální module's panel:
 *  search / filter / sort across the project's reviews, a sentiment summary, a
 *  per-review AI reply (reusing the existing `local-review-reply` operation),
 *  flag-for-owner, and saved-reply macros. Per-review triage (drafts, answered,
 *  flagged) persists to the project (per-user, server-side): draft edits are saved
 *  debounced, a flag / mark-answered saves immediately and posts to the activity
 *  feed. Ported in spirit from the local-SEO app's ReviewInbox. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pill } from "@/components/ui";
import { Bolt, Bookmark, Check, Copy, Info, Refresh, Search, Sparkles } from "@/components/icons";
import { useAiTool } from "@/components/ai/useAiTool";
import { RefineBar } from "@/components/ai/primitives";
import type { LocalReviewReplyResult } from "@/lib/ai-types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { ReviewItem } from "@/lib/reviews/sample";
import { promptSafeName } from "@/lib/projects/name";
import {
  expandMacro,
  filterReviews,
  sentiment,
  sortReviews,
  type BandFilter,
  type ReviewFilter,
  type SortKey,
  type StatusFilter,
} from "@/lib/reviews/compute";

const T = {
  cs: {
    searchPlaceholder: "Hledat v recenzích…",
    bandAll: "Vše", bandPositive: "Kladné", bandNeutral: "Neutrální", bandNegative: "Kritické",
    areaAll: "Všechny lokality",
    statusAll: "Vše", statusUnanswered: "Bez odpovědi", statusAnswered: "Zodpovězené", statusFlagged: "Označené",
    sortNewest: "Nejnovější", sortOldest: "Nejstarší", sortRatingDesc: "Nejvyšší hodnocení", sortRatingAsc: "Nejnižší hodnocení",
    unanswered: "Bez odpovědi", avg: "Průměr", total: "Recenzí",
    empty: "Žádné recenze neodpovídají filtru.",
    daysAgo: "před {n} dny", today: "dnes",
    suggest: "Navrhnout odpověď", suggestAgain: "Navrhnout znovu", generating: "Generuji…",
    flag: "Označit majiteli", flagged: "Označeno", markAnswered: "Označit jako zodpovězené", answered: "Zodpovězeno",
    draftLabel: "Návrh odpovědi", aiReply: "AI odpověď", demoMode: "Ukázkový režim",
    macros: "Šablony", copy: "Kopírovat", copied: "Zkopírováno",
    generationFailed: "Generování selhalo", timedOut: "Model neodpověděl včas — zkuste to znovu.", retry: "Zkusit znovu",
    footer: "Odpovídejte veřejně — vřelé poděkování buduje důvěru, vstřícná reakce na kritiku snižuje její dopad. Stav se ukládá k projektu; seam: reviews API (Google Business Profile).",
  },
  en: {
    searchPlaceholder: "Search reviews…",
    bandAll: "All", bandPositive: "Positive", bandNeutral: "Neutral", bandNegative: "Critical",
    areaAll: "All locations",
    statusAll: "All", statusUnanswered: "Unanswered", statusAnswered: "Answered", statusFlagged: "Flagged",
    sortNewest: "Newest", sortOldest: "Oldest", sortRatingDesc: "Highest rating", sortRatingAsc: "Lowest rating",
    unanswered: "Unanswered", avg: "Average", total: "Reviews",
    empty: "No reviews match the filter.",
    daysAgo: "{n} days ago", today: "today",
    suggest: "Suggest reply", suggestAgain: "Suggest again", generating: "Generating…",
    flag: "Flag for owner", flagged: "Flagged", markAnswered: "Mark answered", answered: "Answered",
    draftLabel: "Reply draft", aiReply: "AI reply", demoMode: "Demo mode",
    macros: "Templates", copy: "Copy", copied: "Copied",
    generationFailed: "Generation failed", timedOut: "Model timed out — please try again.", retry: "Retry",
    footer: "Reply publicly — a warm thank-you builds trust, an empathetic response to criticism reduces its impact. State is saved to the project; seam: reviews API (Google Business Profile).",
  },
} as const;

const MACROS: Record<"cs" | "en", { id: string; label: string; template: string }[]> = {
  cs: [
    { id: "thanks", label: "Poděkování", template: "Děkujeme, {author}! Vašich slov si moc vážíme a budeme se těšit na příště." },
    { id: "feedback", label: "Zpětná vazba", template: "Děkujeme za zpětnou vazbu, {author}. Vážíme si jí a rádi se dále zlepšíme." },
    { id: "resolve", label: "Náprava", template: "Mrzí nás to, {author}. Rádi bychom to napravili — ozvěte se nám prosím přímo, ať situaci co nejdříve vyřešíme." },
  ],
  en: [
    { id: "thanks", label: "Thanks", template: "Thank you, {author}! We truly appreciate your words and look forward to seeing you again." },
    { id: "feedback", label: "Feedback", template: "Thanks for the feedback, {author}. We value it and will keep improving." },
    { id: "resolve", label: "Make it right", template: "We're sorry, {author}. We'd like to make this right — please reach out to us directly so we can resolve it quickly." },
  ],
};

function ratingTone(rating: number): "positive" | "coral" | "negative" {
  if (rating >= 4) return "positive";
  if (rating === 3) return "coral";
  return "negative";
}

export interface ReviewInboxState {
  answered: string[];
  flagged: string[];
  drafts: Record<string, string>;
  filter?: Partial<ReviewFilter>;
  sort?: SortKey;
}

export default function ReviewInbox({
  reviews,
  areas,
  businessName,
  businessType,
  projectId,
  initialState,
}: {
  reviews: ReviewItem[];
  areas: string[];
  businessName?: string;
  businessType?: string;
  projectId: string;
  initialState?: ReviewInboxState;
}) {
  const t = useT(T);
  const fmt = useFormatters();
  const { locale } = useLocale();
  const localeMacros = MACROS[locale === "en" ? "en" : "cs"];

  const [filter, setFilter] = useState<ReviewFilter>({
    query: "",
    band: "all",
    area: "all",
    status: "all",
    ...(initialState?.filter ?? {}),
  });
  const [sort, setSort] = useState<SortKey>(initialState?.sort ?? "newest");
  const [answered, setAnswered] = useState<Set<string>>(() => new Set(initialState?.answered ?? []));
  const [flagged, setFlagged] = useState<Set<string>>(() => new Set(initialState?.flagged ?? []));
  const [drafts, setDrafts] = useState<Map<string, string>>(() => new Map(Object.entries(initialState?.drafts ?? {})));
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Persist the whole triage snapshot to the project (per-user, server-side).
  // Best-effort; local state already updated. A named `event` posts to the feed.
  const stateUrl = `/api/projects/${projectId}/state/reviews`;
  function save(a: Set<string>, f: Set<string>, d: Map<string, string>, event?: string) {
    const data: ReviewInboxState = { answered: [...a], flagged: [...f], drafts: Object.fromEntries(d) };
    void fetch(stateUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data, ...(event ? { event } : {}) }),
    }).catch(() => {});
  }

  // Draft edits (typing, macros, an applied AI reply) save debounced — coalesce
  // keystrokes into one write. Skip the initial mount; flag/answered save eagerly.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const id = setTimeout(() => save(answered, flagged, drafts), 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  // AI reply — reuse the existing operation (single-flight; pinned to activeId).
  const { status, data, error, timedOut, run, reset, refine, canRefine } =
    useAiTool<LocalReviewReplyResult>("local-review-reply");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [appliedFor, setAppliedFor] = useState<string | null>(null);

  // The clean brand only — used both in the prompt and in {business} macros, so
  // neither the AI reply nor a saved-reply draft ever carries "(demo)" (L1-19).
  const cleanBusinessName = promptSafeName(businessName);

  const aiReply = status === "done" && activeId ? data?.result?.reply ?? null : null;
  const applyTag = activeId && aiReply ? `${activeId}:${aiReply}` : null;
  if (applyTag && activeId && aiReply && applyTag !== appliedFor) {
    setAppliedFor(applyTag);
    setDrafts((m) => new Map(m).set(activeId, aiReply));
  }
  const isDemo = Boolean(data?.meta.demo);

  const augmented = useMemo(
    () => reviews.map((r) => ({ ...r, answered: answered.has(r.id), flagged: flagged.has(r.id) })),
    [reviews, answered, flagged]
  );
  const s = useMemo(() => sentiment(augmented), [augmented]);
  const visible = useMemo(() => sortReviews(filterReviews(augmented, filter), sort), [augmented, filter, sort]);

  function suggest(r: ReviewItem) {
    if (status === "loading") return;
    setActiveId(r.id);
    reset();
    setAppliedFor(null);
    run({
      reviewText: r.text,
      rating: r.rating,
      area: r.area,
      ...(businessType ? { businessType } : {}),
      ...(cleanBusinessName ? { businessName: cleanBusinessName } : {}),
    });
  }

  function setDraft(id: string, text: string) {
    setDrafts((m) => new Map(m).set(id, text));
  }
  // Discrete triage transitions save immediately; turning one ON posts to the feed.
  function toggleFlag(id: string) {
    const next = new Set(flagged);
    const on = !next.has(id);
    if (on) next.add(id);
    else next.delete(id);
    setFlagged(next);
    save(answered, next, drafts, on ? "flagged" : undefined);
  }
  function toggleAnswered(id: string) {
    const next = new Set(answered);
    const on = !next.has(id);
    if (on) next.add(id);
    else next.delete(id);
    setAnswered(next);
    save(next, flagged, drafts, on ? "reply-published" : undefined);
  }
  async function copyDraft(id: string) {
    const text = drafts.get(id);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1300);
    } catch {
      /* clipboard unavailable */
    }
  }
  const rel = (d: number) => (d <= 0 ? t("today") : t("daysAgo", { n: d }));

  const bandButtons: { key: BandFilter; label: string }[] = [
    { key: "all", label: t("bandAll") },
    { key: "positive", label: t("bandPositive") },
    { key: "neutral", label: t("bandNeutral") },
    { key: "negative", label: t("bandNegative") },
  ];
  const statusButtons: { key: StatusFilter; label: string }[] = [
    { key: "all", label: t("statusAll") },
    { key: "unanswered", label: t("statusUnanswered") },
    { key: "answered", label: t("statusAnswered") },
    { key: "flagged", label: t("statusFlagged") },
  ];

  return (
    <div className="space-y-5">
      {/* Sentiment summary */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-6">
          <Stat label={t("total")} value={fmt.fmtInt(s.total)} />
          <Stat label={t("avg")} value={`${fmt.fmtDecimal(s.avg, 1)} ★`} tone="positive" />
          <Stat label={t("unanswered")} value={fmt.fmtInt(s.unanswered)} tone={s.unanswered > 0 ? "coral" : undefined} />
          <div className="min-w-[180px] flex-1">
            <div className="flex h-2.5 overflow-hidden rounded-pill">
              <span className="bg-positive" style={{ width: `${pct(s.positive, s.total)}%` }} />
              <span className="bg-coral-400" style={{ width: `${pct(s.neutral, s.total)}%` }} />
              <span className="bg-negative" style={{ width: `${pct(s.negative, s.total)}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted">
              <span className="tnum">{t("bandPositive")} {s.positive}</span>
              <span className="tnum">{t("bandNeutral")} {s.neutral}</span>
              <span className="tnum">{t("bandNegative")} {s.negative}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search width={15} height={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={filter.query}
            onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-pill border border-line bg-surface py-2 pl-9 pr-3 text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <Segmented value={filter.band} onChange={(band) => setFilter((f) => ({ ...f, band }))} options={bandButtons} />
        <select
          value={filter.area}
          onChange={(e) => setFilter((f) => ({ ...f, area: e.target.value }))}
          className="rounded-pill border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-400 focus:outline-none"
        >
          <option value="all">{t("areaAll")}</option>
          {areas.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-pill border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-400 focus:outline-none"
        >
          <option value="newest">{t("sortNewest")}</option>
          <option value="oldest">{t("sortOldest")}</option>
          <option value="rating-desc">{t("sortRatingDesc")}</option>
          <option value="rating-asc">{t("sortRatingAsc")}</option>
        </select>
      </div>
      <Segmented value={filter.status} onChange={(status) => setFilter((f) => ({ ...f, status }))} options={statusButtons} />

      {/* List */}
      <div className="card overflow-hidden">
        {visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((r) => {
              const loadingThis = status === "loading" && activeId === r.id;
              const errorThis = status === "error" && activeId === r.id;
              const draft = drafts.get(r.id) ?? "";
              const hasDraft = draft.length > 0;
              const isAnswered = answered.has(r.id);
              const isFlagged = flagged.has(r.id);
              return (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-navy-800">{r.author}</span>
                        <span className="text-xs text-muted">{r.area} · {rel(r.daysAgo)}</span>
                        <Pill tone={ratingTone(r.rating)}>{fmt.fmtDecimal(r.rating, 1)} ★</Pill>
                        {isAnswered && <Pill tone="positive"><Check width={12} height={12} />{t("answered")}</Pill>}
                        {isFlagged && <Pill tone="coral"><Bookmark width={12} height={12} />{t("flagged")}</Pill>}
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-navy-700">{r.text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => suggest(r)}
                      disabled={status === "loading"}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loadingThis ? (
                        <><Sparkles width={13} height={13} className="animate-pulse" />{t("generating")}</>
                      ) : hasDraft ? (
                        <><Refresh width={13} height={13} />{t("suggestAgain")}</>
                      ) : (
                        <><Bolt width={13} height={13} />{t("suggest")}</>
                      )}
                    </button>
                  </div>

                  {/* row actions */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleFlag(r.id)}
                      className={"inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors " + (isFlagged ? "border-coral-400 bg-coral-500/10 text-coral-600" : "border-line text-muted hover:border-brand-300")}
                    >
                      <Bookmark width={13} height={13} />{isFlagged ? t("flagged") : t("flag")}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleAnswered(r.id)}
                      className={"inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors " + (isAnswered ? "border-positive/50 bg-positive-soft text-positive" : "border-line text-muted hover:border-brand-300")}
                    >
                      <Check width={13} height={13} />{isAnswered ? t("answered") : t("markAnswered")}
                    </button>
                  </div>

                  {errorThis && (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-xs">
                      <span className="text-negative">{timedOut ? t("timedOut") : `${t("generationFailed")}${error ? `: ${error}` : "."}`}</span>
                      <button type="button" onClick={() => suggest(r)} className="shrink-0 rounded-pill border border-line bg-surface px-2.5 py-1 font-medium text-navy-700 hover:border-brand-300">{t("retry")}</button>
                    </div>
                  )}

                  {(hasDraft || activeId === r.id) && !loadingThis && (
                    <div className="mt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("draftLabel")}</p>
                          {activeId === r.id && hasDraft && (isDemo ? (
                            <Pill tone="coral"><Info width={12} height={12} />{t("demoMode")}</Pill>
                          ) : (
                            <Pill tone="positive"><Sparkles width={12} height={12} />{t("aiReply")}</Pill>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => copyDraft(r.id)}
                          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
                        >
                          {copiedId === r.id ? <Check width={13} height={13} className="text-positive" /> : <Copy width={13} height={13} />}
                          {copiedId === r.id ? t("copied") : t("copy")}
                        </button>
                      </div>
                      {/* saved-reply macros */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t("macros")}:</span>
                        {localeMacros.map((mac) => (
                          <button
                            key={mac.id}
                            type="button"
                            onClick={() => setDraft(r.id, expandMacro(mac.template, { author: r.author, business: cleanBusinessName, area: r.area }))}
                            className="rounded-pill border border-line bg-surface px-2.5 py-1 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
                          >
                            {mac.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(r.id, e.target.value)}
                        rows={3}
                        className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                      />
                      {activeId === r.id && status === "done" && canRefine && (
                        <div className="mt-2"><RefineBar onRefine={refine} /></div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t border-line px-5 py-3 text-xs text-muted">{t("footer")}</div>
      </div>
    </div>
  );
}

function pct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "coral" }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={"tnum mt-1 text-xl font-semibold " + (tone === "positive" ? "text-positive" : tone === "coral" ? "text-coral-600" : "text-navy-800")}>{value}</p>
    </div>
  );
}

function Segmented<K extends string>({
  value,
  onChange,
  options,
}: {
  value: K;
  onChange: (k: K) => void;
  options: { key: K; label: string }[];
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-pill border border-line">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={"px-3 py-1.5 text-xs font-semibold transition-colors " + (value === o.key ? "bg-brand-500/15 text-brand-accent" : "text-muted hover:bg-brand-50")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
