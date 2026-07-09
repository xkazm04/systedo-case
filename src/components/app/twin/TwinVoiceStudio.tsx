"use client";

/** The training loop, one screen.
 *
 *  Pick a channel → paste real messages you've already sent → the twin distils a
 *  voice AND tells you what it still can't infer (`gapQuestions`). Answer those and
 *  re-distil; the answers ride back as `answers` and the voice sharpens. Apply, and
 *  every draft on that channel writes in it.
 *
 *  This is `twin-style` end to end. There is no separate "interview" call: one
 *  schema returns both the distillation and the next round's questions, which is
 *  the whole reason the personas plugin's two Claude-CLI commands collapse into
 *  one operation here. */
import { useMemo, useState } from "react";
import { useProject } from "@/lib/projects/context";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import { Check, Plus, Sparkles, Close } from "@/components/icons";
import { useAiTool } from "@/components/ai/useAiTool";
import { LoadingTimer, RefineBar, ResultMeta, TimeoutState, ToolError, inputClass } from "@/components/ai/primitives";
import { promptSafeName } from "@/lib/projects/name";
import type { TwinStyleResult } from "@/lib/ai-types";
import type { ProjectType } from "@/lib/projects/types";
import {
  TONE_SCOPES,
  type ToneScope,
  type TwinState,
  type TwinStyleFact,
  type TwinVoice,
} from "@/lib/twin/types";

const T = {
  cs: {
    scope: "Kanál hlasu",
    scopeHint: "Obecný registr platí všude, kde kanál nemá vlastní hlas.",
    samplesLabel: "Reálné zprávy, které jste poslali",
    samplesHint: "Vložte 2–10 skutečných zpráv. Čím reálnější, tím přesnější hlas — twin si styl nevymýšlí.",
    addSample: "Přidat ukázku",
    samplePlaceholder: "Vložte zprávu, kterou jste opravdu poslali…",
    remove: "Odebrat",
    distil: "Vytáhnout hlas (AI)",
    distilling: "Analyzuji styl…",
    redistil: "Přegenerovat",
    materials: "{n} podkladů",
    resultTitle: "Hlas je vytažený",
    apply: "Uložit tento hlas",
    dismiss: "Zavřít",
    directives: "Pokyny ke stylu",
    traits: "Rysy",
    lengthHint: "Délka",
    constraints: "Mantinely",
    examples: "Vzorové věty",
    gapQuestions: "Co twin ještě neví",
    gapHint: "Odpovězte a spusťte znovu — odpovědi hlas zpřesní.",
    answerPlaceholder: "Vaše odpověď…",
    saveAnswer: "Uložit odpověď",
    savedFacts: "Uložené podklady ({n})",
    noFacts: "Zatím žádné podklady. Vložte ukázky nebo odpovězte na otázky twinu.",
    currentVoice: "Aktuální hlas na tomto kanálu",
    noVoice: "Tento kanál zatím nemá vlastní hlas — použije se obecný registr.",
    always: "Vždy",
    never: "Nikdy",
    sourceSample: "ukázka",
    sourceInterview: "odpověď",
  },
  en: {
    scope: "Voice channel",
    scopeHint: "The generic register applies wherever a channel has no voice of its own.",
    samplesLabel: "Real messages you've sent",
    samplesHint: "Paste 2–10 real messages. The more real, the truer the voice — the twin never invents a style.",
    addSample: "Add sample",
    samplePlaceholder: "Paste a message you actually sent…",
    remove: "Remove",
    distil: "Extract the voice (AI)",
    distilling: "Analysing style…",
    redistil: "Regenerate",
    materials: "{n} materials",
    resultTitle: "The voice is extracted",
    apply: "Save this voice",
    dismiss: "Dismiss",
    directives: "Style directives",
    traits: "Traits",
    lengthHint: "Length",
    constraints: "Guardrails",
    examples: "Example lines",
    gapQuestions: "What the twin still doesn't know",
    gapHint: "Answer these and re-run — the answers sharpen the voice.",
    answerPlaceholder: "Your answer…",
    saveAnswer: "Save answer",
    savedFacts: "Saved material ({n})",
    noFacts: "No material yet. Paste samples or answer the twin's questions.",
    currentVoice: "Current voice on this channel",
    noVoice: "This channel has no voice of its own yet — the generic register applies.",
    always: "Always",
    never: "Never",
    sourceSample: "sample",
    sourceInterview: "answer",
  },
} as const;

const SCOPE_LABELS: Record<ToneScope, { cs: string; en: string }> = {
  generic: { cs: "Obecný registr", en: "Generic register" },
  leads: { cs: "Poptávky", en: "Enquiries" },
  email: { cs: "E-mail", en: "Email" },
  chat: { cs: "Chat", en: "Chat" },
  social: { cs: "Sociální sítě", en: "Social" },
  reviews: { cs: "Recenze", en: "Reviews" },
  sms: { cs: "SMS", en: "SMS" },
  whatsapp: { cs: "WhatsApp", en: "WhatsApp" },
};

const uid = () => Math.random().toString(36).slice(2, 10);

export default function TwinVoiceStudio({
  state,
  projectType,
  onCommit,
}: {
  state: TwinState;
  projectType: ProjectType;
  onCommit: (next: TwinState) => void;
}) {
  const project = useProject();
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";

  const [scope, setScope] = useState<ToneScope>("generic");
  const [samples, setSamples] = useState<string[]>([""]);
  /** gapQuestion → the answer the user is typing (unsaved). */
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState(false);

  const ai = useAiTool<TwinStyleResult>("twin-style", scope);

  const currentVoice = state.voices.find((v) => v.scope === scope) ?? null;
  const scopeFacts = useMemo(() => state.facts.filter((f) => f.scope === scope), [state.facts, scope]);

  /** Everything the model gets to look at: the pasted samples in this session plus
   *  every fact already saved for this scope (past pastes + past answers). */
  const materialCount = samples.filter((s) => s.trim()).length + scopeFacts.length;

  const runDistil = () => {
    setApplied(false);
    const pasted = samples.map((s) => s.trim()).filter(Boolean);
    const savedSamples = scopeFacts.filter((f) => f.source === "sample").map((f) => f.answer);
    const savedAnswers = scopeFacts
      .filter((f) => f.source === "interview")
      .map((f) => ({ question: f.question, answer: f.answer }));
    ai.run({
      scope,
      projectType,
      brand: promptSafeName(project.name),
      ...(pasted.length + savedSamples.length > 0 ? { samples: [...pasted, ...savedSamples] } : {}),
      ...(savedAnswers.length > 0 ? { answers: savedAnswers } : {}),
      ...(currentVoice?.directives ? { current: currentVoice.directives } : {}),
    });
  };

  /** Persist the distilled voice for this scope, and bank the pasted samples as
   *  style facts so the next distillation still sees them. */
  const applyVoice = () => {
    const r = ai.data?.result;
    if (!r) return;
    const now = new Date().toISOString();
    const voice: TwinVoice = {
      scope,
      directives: r.directives,
      traits: r.traits,
      lengthHint: r.lengthHint,
      constraints: r.constraints,
      examples: r.examples,
      updatedAt: now,
    };
    const bankedSamples: TwinStyleFact[] = samples
      .map((s) => s.trim())
      .filter(Boolean)
      .map((answer) => ({ id: uid(), scope, question: "", answer, source: "sample" as const, createdAt: now }));

    onCommit({
      ...state,
      voices: [...state.voices.filter((v) => v.scope !== scope), voice],
      facts: [...state.facts, ...bankedSamples],
    });
    setSamples([""]);
    setApplied(true);
  };

  /** Bank one answered gap question as a style fact. It shows up as material on the
   *  next distil — that is the whole feedback loop. */
  const saveAnswer = (question: string) => {
    const answer = (answers[question] ?? "").trim();
    if (!answer) return;
    onCommit({
      ...state,
      facts: [
        ...state.facts,
        { id: uid(), scope, question, answer, source: "interview", createdAt: new Date().toISOString() },
      ],
    });
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[question];
      return next;
    });
  };

  const result = ai.status === "done" ? ai.data?.result ?? null : null;

  return (
    <div className="space-y-6">
      {/* Scope picker */}
      <div>
        <label htmlFor="twin-scope" className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("scope")}
        </label>
        <select
          id="twin-scope"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as ToneScope);
            setApplied(false);
            setSamples([""]);
          }}
          className={`${inputClass} mt-1.5 max-w-xs`}
        >
          {TONE_SCOPES.map((s) => (
            <option key={s} value={s}>
              {SCOPE_LABELS[s][L]}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted">{t("scopeHint")}</p>
      </div>

      {/* The voice in force right now */}
      <section className="rounded-card border border-line bg-canvas p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("currentVoice")}</p>
        {currentVoice && currentVoice.directives ? (
          <div className="mt-2 space-y-3">
            <p className="whitespace-pre-line text-sm leading-relaxed text-navy-700">{currentVoice.directives}</p>
            {currentVoice.traits.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {currentVoice.traits.map((tr) => (
                  <span key={tr} className="pill bg-brand-50 text-brand-700">
                    {tr}
                  </span>
                ))}
                {currentVoice.lengthHint && (
                  <span className="pill bg-navy-50 text-muted">{currentVoice.lengthHint}</span>
                )}
              </div>
            )}
            {currentVoice.constraints.length > 0 && (
              <ul className="space-y-1">
                {currentVoice.constraints.map((c, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed">
                    <span
                      className={`shrink-0 font-semibold ${c.kind === "do" ? "text-positive" : "text-negative"}`}
                    >
                      {c.kind === "do" ? t("always") : t("never")}:
                    </span>
                    <span className="text-navy-700">{c.rule}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">{t("noVoice")}</p>
        )}
      </section>

      {/* Samples */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("samplesLabel")}</p>
          <span className="pill bg-navy-50 text-muted">{t("materials", { n: materialCount })}</span>
        </div>
        <p className="text-xs text-muted">{t("samplesHint")}</p>
        <div className="space-y-2">
          {samples.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <textarea
                value={s}
                onChange={(e) => setSamples((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                rows={3}
                placeholder={t("samplePlaceholder")}
                className="flex-1 resize-y rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
              {samples.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSamples((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={t("remove")}
                  className="mt-1 rounded-full border border-line p-1.5 text-muted transition-colors hover:border-negative/40 hover:text-negative"
                >
                  <Close width={13} height={13} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSamples((prev) => [...prev, ""])}
            disabled={samples.length >= 10}
            className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-navy-800 disabled:opacity-40"
          >
            <Plus width={13} height={13} />
            {t("addSample")}
          </button>
          <button
            type="button"
            onClick={runDistil}
            disabled={ai.status === "loading"}
            className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles width={16} height={16} className={ai.status === "loading" ? "animate-pulse" : ""} />
            {ai.status === "loading" ? t("distilling") : currentVoice?.directives ? t("redistil") : t("distil")}
          </button>
        </div>
      </section>

      {ai.status === "loading" && <LoadingTimer expectedMs={ai.expectedMs} />}
      {ai.status === "error" &&
        (ai.timedOut ? (
          <TimeoutState onRetry={runDistil} />
        ) : (
          <ToolError message={ai.error ?? ""} onRetry={runDistil} retryIn={ai.retryIn} upgradeUrl={ai.upgradeUrl} />
        ))}

      {/* The distillation */}
      {result && !applied && (
        <section className="animate-fade-up space-y-4 rounded-card border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-center gap-2">
            <Sparkles width={16} height={16} className="text-brand-accent" />
            <h3 className="text-sm font-semibold text-navy-800">{t("resultTitle")}</h3>
          </div>
          {ai.data && <ResultMeta meta={ai.data.meta} />}
          <p className="text-sm leading-relaxed text-navy-700">{result.summary}</p>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("directives")}</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-navy-700">{result.directives}</p>
          </div>

          {result.traits.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t("traits")}</span>
              {result.traits.map((tr) => (
                <span key={tr} className="pill bg-surface text-brand-700">
                  {tr}
                </span>
              ))}
              {result.lengthHint && <span className="pill bg-surface text-muted">{result.lengthHint}</span>}
            </div>
          )}

          {result.constraints.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("constraints")}</p>
              <ul className="mt-1 space-y-1">
                {result.constraints.map((c, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed">
                    <span className={`shrink-0 font-semibold ${c.kind === "do" ? "text-positive" : "text-negative"}`}>
                      {c.kind === "do" ? t("always") : t("never")}:
                    </span>
                    <span className="text-navy-700">{c.rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.examples.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("examples")}</p>
              <ul className="mt-1 space-y-1">
                {result.examples.map((e, i) => (
                  <li key={i} className="text-sm italic leading-relaxed text-navy-700">
                    &bdquo;{e}&ldquo;
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyVoice}
              className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
            >
              <Check width={13} height={13} />
              {t("apply")}
            </button>
            <button
              type="button"
              onClick={() => ai.reset()}
              className="rounded-pill border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:text-navy-800"
            >
              {t("dismiss")}
            </button>
          </div>
          {ai.canRefine && <RefineBar onRefine={ai.refine} />}
        </section>
      )}

      {/* The gap questions — the training loop's other half */}
      {result && result.gapQuestions.length > 0 && (
        <section className="space-y-3 rounded-card border border-line bg-surface p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("gapQuestions")}</p>
            <p className="mt-1 text-xs text-muted">{t("gapHint")}</p>
          </div>
          <ul className="space-y-3">
            {result.gapQuestions.map((q) => (
              <li key={q} className="space-y-1.5">
                <p className="text-sm font-medium text-navy-800">{q}</p>
                <div className="flex flex-wrap items-start gap-2">
                  <input
                    type="text"
                    value={answers[q] ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q]: e.target.value }))}
                    placeholder={t("answerPlaceholder")}
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => saveAnswer(q)}
                    disabled={!(answers[q] ?? "").trim()}
                    className="rounded-pill border border-line px-3 py-2 text-xs font-semibold text-muted transition-colors hover:text-navy-800 disabled:opacity-40"
                  >
                    {t("saveAnswer")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Banked material */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("savedFacts", { n: scopeFacts.length })}
        </p>
        {scopeFacts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("noFacts")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {scopeFacts.map((f) => (
              <li key={f.id} className="rounded-card border border-line bg-canvas px-3 py-2">
                <span className="pill bg-navy-50 text-muted">
                  {f.source === "interview" ? t("sourceInterview") : t("sourceSample")}
                </span>
                {f.question && <p className="mt-1.5 text-xs font-medium text-navy-800">{f.question}</p>}
                <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-navy-700">{f.answer}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
