"use client";

import { useState } from "react";
import { Pill } from "@/components/ui";
import { Bolt, Check, Copy, Info, Refresh, Sparkles } from "@/components/icons";
import { useAiTool } from "@/components/ai/useAiTool";
import type { LocalReviewReplyResult } from "@/lib/ai-types";
import type { RecentReview } from "@/lib/local/sample";

const star = (r: number) => `${r.toFixed(1).replace(".", ",")} ★`;

/** Rating → Pill tone: 4–5 positive, 3 coral, ≤2 negative. */
function ratingTone(rating: number): "positive" | "coral" | "negative" {
  if (rating >= 4) return "positive";
  if (rating === 3) return "coral";
  return "negative";
}

/** Reputation panel: each illustrative review gets an AI-drafted public reply —
 *  warm thanks for 4–5★, empathetic de-escalation + offline offer for ≤3★. The
 *  deterministic canned reply is the keyless demo / fallback. Client component
 *  (the rest of LocalModule stays server-rendered). */
export default function LocalReviews({
  reviews,
  businessType,
}: {
  reviews: RecentReview[];
  businessType?: string;
}) {
  // Results persist by mode only, so we pin the current AI result to a review id
  // and ignore output meant for a different one.
  const { status, data, error, timedOut, run, reset } = useAiTool<LocalReviewReplyResult>("local-review-reply");
  const [activeId, setActiveId] = useState<string | null>(null);
  /** id → the reply text shown in that review's editor (user edits live here). */
  const [drafts, setDrafts] = useState<Map<string, string>>(() => new Map());
  /** the most recent AI reply text we've applied, keyed by review id (apply once). */
  const [appliedFor, setAppliedFor] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Accept the model output only when it finished and belongs to the active review.
  const aiReply = status === "done" && activeId ? data?.result?.reply ?? null : null;
  // Push a freshly arrived AI reply into that review's editor exactly once, during
  // render (avoids a set-state-in-effect cascade).
  const applyTag = activeId && aiReply ? `${activeId}:${aiReply}` : null;
  if (applyTag && activeId && aiReply && applyTag !== appliedFor) {
    setAppliedFor(applyTag);
    setDrafts((m) => new Map(m).set(activeId, aiReply));
  }

  function suggest(review: RecentReview) {
    if (status === "loading") return;
    setActiveId(review.id);
    reset();
    setAppliedFor(null);
    run({
      reviewText: review.text,
      rating: review.rating,
      area: review.area,
      ...(businessType ? { businessType } : {}),
    });
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

  const isDemo = Boolean(data?.meta.demo);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-navy-800">
          <Sparkles width={18} height={18} className="text-brand-accent" />
          Nejnovější recenze
        </h3>
        <Pill tone="brand">AI návrh odpovědi</Pill>
      </div>

      <ul className="divide-y divide-line">
        {reviews.map((r) => {
          const loadingThis = status === "loading" && activeId === r.id;
          const errorThis = status === "error" && activeId === r.id;
          const draft = drafts.get(r.id) ?? "";
          const hasDraft = draft.length > 0;
          return (
            <li key={r.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-navy-800">{r.author}</span>
                    <span className="text-xs text-muted">{r.area}</span>
                    <Pill tone={ratingTone(r.rating)}>{star(r.rating)}</Pill>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-navy-700">{r.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => suggest(r)}
                  disabled={status === "loading"}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
                >
                  {loadingThis ? (
                    <>
                      <Sparkles width={13} height={13} className="animate-pulse" />
                      Generuji…
                    </>
                  ) : hasDraft ? (
                    <>
                      <Refresh width={13} height={13} />
                      Navrhnout znovu
                    </>
                  ) : (
                    <>
                      <Bolt width={13} height={13} />
                      Navrhnout odpověď
                    </>
                  )}
                </button>
              </div>

              {loadingThis ? (
                <p className="mt-3 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
                  <Sparkles width={14} height={14} className="shrink-0 animate-pulse" />
                  Připravuji veřejnou odpověď modelem…
                </p>
              ) : null}

              {errorThis ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-xs">
                  <span className="text-negative">
                    {timedOut
                      ? "Model neodpověděl včas — zkuste to prosím znovu."
                      : `Generování selhalo${error ? `: ${error}` : "."}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => suggest(r)}
                    className="shrink-0 rounded-pill border border-line bg-surface px-2.5 py-1 font-medium text-navy-700 hover:border-brand-300"
                  >
                    Zkusit znovu
                  </button>
                </div>
              ) : null}

              {hasDraft && !loadingThis ? (
                <div className="mt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Návrh odpovědi</p>
                      {activeId === r.id && isDemo ? (
                        <Pill tone="coral">
                          <Info width={12} height={12} />
                          Ukázkový režim
                        </Pill>
                      ) : (
                        <Pill tone="positive">
                          <Sparkles width={12} height={12} />
                          AI odpověď
                        </Pill>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => copyDraft(r.id)}
                      className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
                      aria-label="Kopírovat odpověď"
                    >
                      {copiedId === r.id ? (
                        <Check width={13} height={13} className="text-positive" />
                      ) : (
                        <Copy width={13} height={13} />
                      )}
                      {copiedId === r.id ? "Zkopírováno" : "Kopírovat"}
                    </button>
                  </div>
                  <textarea
                    value={draft}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDrafts((m) => new Map(m).set(r.id, next));
                    }}
                    rows={4}
                    className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                  {activeId === r.id && isDemo ? (
                    <p className="mt-2 flex items-center gap-2 rounded-lg border border-coral-soft bg-coral-soft px-3 py-2 text-xs text-coral-600">
                      <Info width={14} height={14} className="shrink-0" />
                      Ukázkový režim (bez API klíče) — připojte LLM pro generování modelem.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line px-5 py-3 text-xs text-muted">
        Odpovídejte na recenze veřejně — vřelé poděkování buduje důvěru, vstřícná reakce na kritiku
        snižuje její dopad. Seam: reviews API (Google Business Profile).
      </div>
    </div>
  );
}
