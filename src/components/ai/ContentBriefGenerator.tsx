"use client";

import { useState } from "react";
import { Bolt, Document } from "@/components/icons";
import {
  CONTENT_TYPE_LABELS,
  CONTENT_TYPES,
  SEO_LIMITS,
  type BriefRequest,
  type BriefResult,
  type ContentType,
} from "@/lib/ai-types";
import { useAiTool } from "./useAiTool";
import {
  CharCount,
  CopyButton,
  Field,
  Group,
  LoadingTimer,
  PromptDisclosure,
  ResultMeta,
  TimeoutState,
  ToolEmpty,
  ToolError,
  inputClass,
} from "./primitives";

const EXAMPLE: BriefRequest = {
  topic: "Jak skladovat ořechy a semínka, aby vydržely čerstvé",
  primaryKeyword: "skladování ořechů",
  audience: "Lidé, kteří nakupují ořechy a semínka do zásoby a chtějí je udržet čerstvé",
  contentType: "blog",
};

const EMPTY: BriefRequest = { topic: "", primaryKeyword: "", audience: "", contentType: "blog" };

/** Google-style search result preview from the generated title/meta/slug. */
function SerpPreview({ title, meta, slug }: { title: string; meta: string; slug: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <p className="text-xs text-muted">Náhled ve vyhledávání</p>
      <div className="mt-2">
        <p className="truncate text-xs text-serp-url">
          mionelo.cz › blog › {slug || "url-slug"}
        </p>
        <p className="mt-0.5 text-lg leading-snug text-serp-link">{title || "Title tag"}</p>
        <p className="mt-1 line-clamp-2 text-sm text-navy-600">
          {meta || "Meta description se zobrazí tady."}
        </p>
      </div>
    </div>
  );
}

function SeoLine({ label, value, limit }: { label: string; value: string; limit: number }) {
  const over = value.length > limit;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${over ? "border-negative/40 bg-negative-soft" : "border-line"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
        <div className="flex items-center gap-1.5">
          <CharCount value={value.length} limit={limit} />
          <CopyButton text={value} label="" />
        </div>
      </div>
      <p className="mt-1 text-sm text-navy-800">{value}</p>
    </div>
  );
}

export default function ContentBriefGenerator() {
  const [form, setForm] = useState<BriefRequest>(EMPTY);
  const { status, data, error, timedOut, run, reset } = useAiTool<BriefResult>("brief");

  const set = <K extends keyof BriefRequest>(key: K, value: BriefRequest[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canSubmit =
    form.topic.trim().length >= 2 &&
    form.primaryKeyword.trim().length >= 2 &&
    form.audience.trim().length >= 2 &&
    status !== "loading";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) run({ ...form });
  }

  const r = data?.result;
  const copyAllText = r
    ? [
        `TITLE: ${r.titleTag}`,
        `META: ${r.metaDescription}`,
        `H1: ${r.h1}`,
        `SLUG: ${r.slug}`,
        "\nOSNOVA:",
        ...r.outline.map((s) => `\n## ${s.heading}\n${s.points.map((p) => `- ${p}`).join("\n")}`),
        "\nFAQ:",
        ...r.faq.map((f) => `Q: ${f.question}\nA: ${f.answer}`),
        `\nKLÍČOVÁ SLOVA: ${r.keywords.join(", ")}`,
        `INTERNÍ ODKAZY: ${r.internalLinks.join(", ")}`,
      ].join("\n")
    : "";

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
      <form onSubmit={onSubmit} className="card space-y-5 p-6 lg:sticky lg:top-24">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-navy-800">Zadání obsahu</h2>
          <button
            type="button"
            onClick={() => setForm(EXAMPLE)}
            className="text-xs font-semibold text-brand-accent hover:text-brand-800"
          >
            Vyplnit ukázku
          </button>
        </div>

        <Field label="Téma" htmlFor="topic">
          <input
            id="topic"
            type="text"
            value={form.topic}
            onChange={(e) => set("topic", e.target.value)}
            placeholder="Jak skladovat ořechy a semínka"
            className={inputClass}
          />
        </Field>

        <Field label="Hlavní klíčové slovo" htmlFor="primaryKeyword">
          <input
            id="primaryKeyword"
            type="text"
            value={form.primaryKeyword}
            onChange={(e) => set("primaryKeyword", e.target.value)}
            placeholder="skladování ořechů"
            className={inputClass}
          />
        </Field>

        <Field label="Cílová skupina" htmlFor="audience-brief">
          <input
            id="audience-brief"
            type="text"
            value={form.audience}
            onChange={(e) => set("audience", e.target.value)}
            placeholder="Lidé, kteří nakupují ořechy do zásoby"
            className={inputClass}
          />
        </Field>

        <Field label="Typ obsahu">
          <div className="grid grid-cols-3 gap-2">
            {CONTENT_TYPES.map((t: ContentType) => (
              <button
                key={t}
                type="button"
                onClick={() => set("contentType", t)}
                className={`rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors ${
                  form.contentType === t
                    ? "border-brand-400 bg-brand-50 text-brand-800"
                    : "border-line text-muted hover:border-navy-200"
                }`}
              >
                {CONTENT_TYPE_LABELS[t]}
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
              <Document width={17} height={17} className="animate-pulse" />
              Připravuji…
            </>
          ) : (
            <>
              <Bolt width={17} height={17} />
              Vytvořit brief
            </>
          )}
        </button>
      </form>

      <div className="min-w-0">
        {status === "idle" && (
          <ToolEmpty
            icon={Document}
            title="Obsahový brief se zobrazí tady"
            body="Zadejte téma a klíčové slovo. Gemini připraví title a meta v SEO limitech, osnovu H2, FAQ i návrhy interních odkazů — kostru, kterou autor jen rozepíše."
            hint="Tip: zkuste „Vyplnit ukázku“ a klikněte na Vytvořit brief."
          />
        )}
        {status === "loading" && <LoadingTimer />}
        {status === "error" &&
          (timedOut ? (
            <TimeoutState onRetry={reset} />
          ) : (
            <ToolError message={error ?? ""} onRetry={reset} />
          ))}

        {status === "done" && r && data && (
          <div className="animate-fade-up space-y-5">
            <ResultMeta meta={data.meta} copyAllText={copyAllText} />

            <SerpPreview title={r.titleTag} meta={r.metaDescription} slug={r.slug} />

            <Group title="SEO metadata">
              <div className="space-y-2">
                <SeoLine label="Title tag" value={r.titleTag} limit={SEO_LIMITS.titleTag} />
                <SeoLine label="Meta description" value={r.metaDescription} limit={SEO_LIMITS.metaDescription} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-line px-3 py-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">H1</span>
                    <p className="mt-1 text-sm text-navy-800">{r.h1}</p>
                  </div>
                  <div className="rounded-lg border border-line px-3 py-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">URL slug</span>
                    <p className="mt-1 truncate font-mono text-sm text-navy-800">{r.slug}</p>
                  </div>
                </div>
              </div>
            </Group>

            <Group title="Osnova" hint={`${r.outline.length} sekcí`}>
              <ol className="space-y-3">
                {r.outline.map((s, i) => (
                  <li key={i} className="rounded-card border border-line bg-surface p-4">
                    <div className="flex items-center gap-2.5">
                      <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-onyx text-xs font-semibold text-white">
                        {i + 1}
                      </span>
                      <h4 className="font-semibold text-navy-800">{s.heading}</h4>
                    </div>
                    {s.points.length > 0 && (
                      <ul className="mt-2.5 space-y-1.5 pl-9">
                        {s.points.map((p, j) => (
                          <li key={j} className="flex gap-2 text-sm text-navy-700">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-400" aria-hidden />
                            {p}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </Group>

            {r.faq.length > 0 && (
              <Group title="FAQ" hint={`${r.faq.length} dotazů`}>
                <div className="space-y-2">
                  {r.faq.map((f, i) => (
                    <div key={i} className="rounded-lg border border-line bg-surface px-4 py-3">
                      <p className="text-sm font-medium text-navy-800">{f.question}</p>
                      <p className="mt-1 text-sm text-navy-600">{f.answer}</p>
                    </div>
                  ))}
                </div>
              </Group>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <Group title="Klíčová slova" hint={`${r.keywords.length}`}>
                <div className="flex flex-wrap gap-2">
                  {r.keywords.map((k, i) => (
                    <span key={i} className="rounded-pill bg-navy-50 px-3 py-1.5 text-sm text-navy-700">
                      {k}
                    </span>
                  ))}
                </div>
              </Group>
              <Group title="Návrhy interních odkazů" hint={`${r.internalLinks.length}`}>
                <ul className="space-y-1.5">
                  {r.internalLinks.map((l, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-navy-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-400" aria-hidden />
                      {l}
                    </li>
                  ))}
                </ul>
              </Group>
            </div>

            {r.rationale && (
              <div className="rounded-card border border-brand-200 bg-brand-50 p-5">
                <p className="text-sm font-semibold text-brand-800">Proč právě takhle</p>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-700">{r.rationale}</p>
              </div>
            )}

            <PromptDisclosure prompt={data.meta.prompt} />
          </div>
        )}
      </div>
    </div>
  );
}
