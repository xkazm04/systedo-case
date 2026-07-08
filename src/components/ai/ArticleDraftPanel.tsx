"use client";

import { useCallback, useState } from "react";
import { Bolt, Document, Download, Image as ImageIcon, Close } from "@/components/icons";
import ArticleBody from "@/components/article/ArticleBody";
import Modal from "@/components/app/Modal";
import { downloadText } from "@/lib/export";
import { useT } from "@/lib/i18n/client";
import { useOptionalProject } from "@/lib/projects/context";
import { inlineToText, type Article, type Block, type FaqItem } from "@/lib/article";
import { blockToMarkdown, inlineToMarkdown, type MarkdownLabels } from "@/lib/article-markdown";
import type { ArticleDraftRequest, ArticleDraftResult, BriefResult } from "@/lib/ai-types";
import type { CreativeSummary } from "@/lib/images/types";
import { useAiTool } from "./useAiTool";
import {
  LoadingTimer,
  PromptDisclosure,
  RefineBar,
  ResultMeta,
  TimeoutState,
  ToolError,
} from "./primitives";

/** A figure block is the app's image block — the shape we insert into the draft. */
type Figure = Extract<Block, { type: "figure" }>;

const T = {
  cs: {
    panelHeading: "Rozepsat článek",
    panelBody: "Z hotového briefu připravíme koncept článku — odstavce, nadpisy, seznamy, tip i závěrečnou výzvu — ve stejné struktuře jako publikovaný článek.",
    regenerate: "Vygenerovat znovu",
    generate: "Rozepsat článek",
    previewTab: "Náhled",
    jsonTab: "Article JSON",
    downloadMdTitle: "Stáhnout koncept jako Markdown",
    downloadMd: "Stáhnout .md",
    downloadJsonTitle: "Stáhnout koncept jako Article JSON",
    downloadJson: "Stáhnout .json",
    faqHeading: "Časté dotazy",
    articleAuthor: "Adamant · obsahový tým",
    articleRole: "Koncept článku z AI briefu",
    articleCategory: "Koncept",
    mdFaqHeading: "Časté dotazy (FAQ)",
    calloutTip: "Tip",
    addHero: "Vložit obrázek z knihovny",
    pickerTitle: "Vizuály z Kreativy",
    pickerBody: "Vyberte vygenerovaný vizuál a vložte ho do článku.",
    pickerEmpty: "Zatím žádné uložené vizuály. Vygenerujte je v modulu Kreativa a vraťte se sem.",
    pickerLoading: "Načítám knihovnu…",
    inserting: "Vkládám…",
    removeImage: "Odebrat obrázek",
    placeholderAdd: "Přidat obrázek: {alt}",
    placeholderHint: "AI navrhla obrázek — vyberte ho z knihovny vizuálů.",
  },
  en: {
    panelHeading: "Expand to article",
    panelBody: "From the finished brief we will prepare an article draft — paragraphs, headings, lists, a tip and a closing CTA — in the same structure as a published article.",
    regenerate: "Regenerate",
    generate: "Expand to article",
    previewTab: "Preview",
    jsonTab: "Article JSON",
    downloadMdTitle: "Download draft as Markdown",
    downloadMd: "Download .md",
    downloadJsonTitle: "Download draft as Article JSON",
    downloadJson: "Download .json",
    faqHeading: "Frequently asked questions",
    articleAuthor: "Adamant · content team",
    articleRole: "Article draft from AI brief",
    articleCategory: "Draft",
    mdFaqHeading: "Frequently asked questions (FAQ)",
    calloutTip: "Tip",
    addHero: "Insert image from library",
    pickerTitle: "Visuals from Creative",
    pickerBody: "Pick a generated visual and insert it into the article.",
    pickerEmpty: "No saved visuals yet. Generate them in the Creative module and come back.",
    pickerLoading: "Loading the library…",
    inserting: "Inserting…",
    removeImage: "Remove image",
    placeholderAdd: "Add image: {alt}",
    placeholderHint: "The AI suggested an image here — pick it from the visual library.",
  },
} as const;

/** Read a Blob as a data: URL — inserted images are embedded as data URLs so the
 *  preview and the .md/.json exports are self-contained and never hit the
 *  auth-gated image route through next/image's server-side optimizer. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Natural pixel size of an image src (for the figure's required width/height),
 *  with a square fallback if it can't be read. */
function imageDims(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1200, height: img.naturalHeight || 1200 });
    img.onerror = () => resolve({ width: 1200, height: 1200 });
    img.src = src;
  });
}

/** Build the full draft Markdown document from the brief metadata + draft body.
 *  Block serialization is the shared `@/lib/article-markdown` implementation
 *  (the same one behind /clanek/markdown), so links, bold AND inserted figures
 *  survive the export. */
function draftToMarkdown(brief: BriefResult, blocks: Block[], faq: FaqItem[], labels: MarkdownLabels): string {
  const lines: string[] = [`# ${brief.h1 || brief.titleTag}`, ""];
  if (brief.metaDescription) lines.push(`_${brief.metaDescription}_`, "");
  for (const block of blocks) {
    const md = blockToMarkdown(block, labels);
    if (md) lines.push(md, "");
  }
  if (faq.length > 0) {
    lines.push(`## ${labels.faqHeading}`, "");
    for (const f of faq) lines.push(`**${f.q}**`, "", inlineToMarkdown(f.a), "");
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** Assemble a publish-ready Article (same shape as src/data/article.json) so the
 *  draft — including inserted figures — can be exported as headless content JSON. */
function draftToArticle(brief: BriefResult, blocks: Block[], faq: FaqItem[], author: string, role: string, category: string): Article {
  return {
    meta: {
      title: brief.h1 || brief.titleTag,
      perex: brief.metaDescription,
      author,
      role,
      dateISO: new Date().toISOString().slice(0, 10),
      readingMinutes: Math.max(1, Math.round(blocks.length / 3)),
      category,
      tags: brief.keywords.slice(0, 6),
    },
    blocks,
    faq,
  };
}

/** The export/render block list: a hero figure (if inserted) up front, then the
 *  draft body with each AI figure placeholder replaced by the picked image and
 *  any still-empty placeholder dropped (nothing half-rendered leaves the panel). */
function composeBlocks(blocks: Block[], hero: Figure | null, fills: Record<number, Figure>): Block[] {
  const out: Block[] = [];
  if (hero) out.push(hero);
  blocks.forEach((b, i) => {
    if (b.type === "figure") {
      const filled = fills[i];
      if (filled) out.push(filled);
    } else {
      out.push(b);
    }
  });
  return out;
}

/** Inline FAQ list, mirroring the /clanek FAQ accordion styling. */
function DraftFaq({ faq, heading }: { faq: FaqItem[]; heading: string }) {
  if (faq.length === 0) return null;
  return (
    <section className="mt-10" aria-labelledby="draft-faq-heading">
      <h2 id="draft-faq-heading" className="text-xl font-semibold tracking-tight text-navy-800">
        {heading}
      </h2>
      <div className="mt-4 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {faq.map((f, i) => (
          <details key={i} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium text-navy-800">
              {f.q}
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-600 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-navy-700">{inlineToText(f.a)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** A rendered (picked) figure with a remove control. */
function FigureView({ fig, onRemove, removeLabel }: { fig: Figure; onRemove: () => void; removeLabel: string }) {
  return (
    <figure className="group relative my-6 overflow-hidden rounded-card border border-line">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fig.src} alt={fig.alt} className="w-full object-cover" />
      {fig.caption && <figcaption className="px-4 py-2 text-sm text-muted">{fig.caption}</figcaption>}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-onyx/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Close width={14} height={14} />
      </button>
    </figure>
  );
}

/** The draft body: consecutive non-figure blocks are rendered by the shared
 *  ArticleBody; figures are handled here so an AI placeholder (empty src) shows a
 *  dashed "add image" slot, and a filled one renders inline — never through
 *  next/image (data-URL images stay client-side). */
function DraftPreview({
  blocks,
  fills,
  onPick,
  onRemove,
  t,
}: {
  blocks: Block[];
  fills: Record<number, Figure>;
  onPick: (index: number, alt: string, caption?: string) => void;
  onRemove: (index: number) => void;
  t: ReturnType<typeof useT<keyof typeof T.cs>>;
}) {
  const groups: Array<{ kind: "blocks"; blocks: Block[] } | { kind: "figure"; index: number; fig: Figure }> = [];
  let buffer: Block[] = [];
  const flush = () => {
    if (buffer.length) {
      groups.push({ kind: "blocks", blocks: buffer });
      buffer = [];
    }
  };
  blocks.forEach((b, i) => {
    if (b.type === "figure") {
      flush();
      groups.push({ kind: "figure", index: i, fig: b });
    } else {
      buffer.push(b);
    }
  });
  flush();

  return (
    <>
      {groups.map((g, gi) =>
        g.kind === "blocks" ? (
          <ArticleBody key={`b-${gi}`} blocks={g.blocks} />
        ) : fills[g.index] ? (
          <FigureView
            key={`f-${g.index}`}
            fig={fills[g.index]!}
            onRemove={() => onRemove(g.index)}
            removeLabel={t("removeImage")}
          />
        ) : (
          <button
            key={`f-${g.index}`}
            type="button"
            onClick={() => onPick(g.index, g.fig.alt, g.fig.caption)}
            className="my-6 flex w-full flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line px-4 py-8 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40"
          >
            <ImageIcon width={22} height={22} className="text-muted" />
            <span className="text-sm font-medium text-navy-700">{t("placeholderAdd", { alt: g.fig.alt })}</span>
            <span className="text-xs text-muted">{t("placeholderHint")}</span>
          </button>
        )
      )}
    </>
  );
}

/** "Expand to article" — turns a finished brief into a near-publishable draft as the
 *  app's typed Block[] + FAQ, rendered through the same ArticleBody as /clanek and
 *  exportable as Markdown or article JSON. Generated visuals from the Creative
 *  library can be inserted as figures (a manual hero image and/or by filling the
 *  AI's suggested figure placeholders). */
export default function ArticleDraftPanel({ brief }: { brief: BriefResult }) {
  const t = useT(T);
  const project = useOptionalProject();
  const pid = project?.id;
  const { status, data, error, retryIn, upgradeUrl, timedOut, run, reset, history, activeIndex, restore, refine, canRefine, expectedMs } =
    useAiTool<ArticleDraftResult>("article-draft");
  const [preview, setPreview] = useState<"preview" | "json">("preview");

  // Inserted imagery: one optional hero figure + AI figure placeholders filled by
  // block index. Both are dropped whenever a new draft is generated.
  const [hero, setHero] = useState<Figure | null>(null);
  const [fills, setFills] = useState<Record<number, Figure>>({});

  // Creative library + picker modal state. `target` is the placeholder block index
  // being filled, or "hero" for the manual hero slot.
  const [library, setLibrary] = useState<CreativeSummary[]>([]);
  const [libLoaded, setLibLoaded] = useState(false);
  const [picker, setPicker] = useState<{ target: number | "hero"; alt: string; caption?: string } | null>(null);
  const [inserting, setInserting] = useState(false);

  const fileUrl = (id: string) =>
    pid ? `/api/images/file/${id}?projectId=${encodeURIComponent(pid)}` : `/api/images/file/${id}`;

  const loadLibrary = useCallback(async () => {
    try {
      const res = await fetch(pid ? `/api/images?projectId=${encodeURIComponent(pid)}` : "/api/images");
      const json = res.ok ? ((await res.json()) as { creatives?: CreativeSummary[] }) : { creatives: [] };
      setLibrary(json.creatives ?? []);
    } catch {
      setLibrary([]);
    } finally {
      setLibLoaded(true);
    }
  }, [pid]);

  const openPicker = (target: number | "hero", alt: string, caption?: string) => {
    setPicker({ target, alt, caption });
    if (!libLoaded) void loadLibrary();
  };

  const chooseCreative = async (c: CreativeSummary) => {
    if (!picker) return;
    setInserting(true);
    try {
      const res = await fetch(fileUrl(c.id));
      if (!res.ok) return;
      const src = await blobToDataUrl(await res.blob());
      const { width, height } = await imageDims(src);
      const fig: Figure = {
        type: "figure",
        src,
        alt: picker.alt || c.prompt,
        width,
        height,
        ...(picker.caption ? { caption: picker.caption } : {}),
      };
      if (picker.target === "hero") setHero(fig);
      else setFills((f) => ({ ...f, [picker.target as number]: fig }));
      setPicker(null);
    } finally {
      setInserting(false);
    }
  };

  function onGenerate() {
    // A fresh draft invalidates any imagery pinned to the previous one.
    setHero(null);
    setFills({});
    const payload: ArticleDraftRequest = {
      titleTag: brief.titleTag,
      metaDescription: brief.metaDescription,
      h1: brief.h1,
      slug: brief.slug,
      outline: brief.outline,
      faq: brief.faq,
      keywords: brief.keywords,
    };
    run(payload as unknown as Record<string, unknown>);
  }

  const draft = data?.result;
  const slug = brief.slug || "clanek";
  const composed = draft ? composeBlocks(draft.blocks, hero, fills) : [];

  const exportMarkdown = () => {
    if (!draft) return;
    downloadText(
      `systedo-clanek-${slug}.md`,
      draftToMarkdown(brief, composed, draft.faq, { calloutTitle: t("calloutTip"), faqHeading: t("mdFaqHeading") }),
      "text/markdown;charset=utf-8"
    );
  };

  const exportJson = () => {
    if (!draft) return;
    downloadText(
      `systedo-clanek-${slug}.json`,
      JSON.stringify(
        draftToArticle(brief, composed, draft.faq, t("articleAuthor"), t("articleRole"), t("articleCategory")),
        null,
        2
      ),
      "application/json;charset=utf-8"
    );
  };

  return (
    <div className="card space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-navy-800">{t("panelHeading")}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {t("panelBody")}
          </p>
        </div>
        {status !== "loading" && (
          <button
            type="button"
            onClick={status === "done" ? reset : onGenerate}
            className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-onyx px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            {status === "done" ? (
              <>
                <Document width={16} height={16} />
                {t("regenerate")}
              </>
            ) : (
              <>
                <Bolt width={16} height={16} />
                {t("generate")}
              </>
            )}
          </button>
        )}
      </div>

      {status === "loading" && <LoadingTimer expectedMs={expectedMs} />}
      {status === "error" &&
        (timedOut ? (
          <TimeoutState onRetry={reset} />
        ) : (
          <ToolError message={error ?? ""} onRetry={reset} retryIn={retryIn} upgradeUrl={upgradeUrl} />
        ))}

      {status === "done" && draft && data && (
        <div className="animate-fade-up space-y-5">
          <ResultMeta meta={data.meta} history={history} activeIndex={activeIndex} onRestore={restore} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-pill border border-line p-0.5 text-xs font-medium">
              {(["preview", "json"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPreview(v)}
                  aria-pressed={preview === v}
                  className={`rounded-pill px-3 py-1 transition-colors ${
                    preview === v ? "bg-onyx text-white" : "text-muted hover:text-navy-700"
                  }`}
                >
                  {v === "preview" ? t("previewTab") : t("jsonTab")}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openPicker("hero", brief.h1 || brief.titleTag)}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                <ImageIcon width={14} height={14} />
                {t("addHero")}
              </button>
              <button
                type="button"
                onClick={exportMarkdown}
                title={t("downloadMdTitle")}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                <Download width={14} height={14} />
                {t("downloadMd")}
              </button>
              <button
                type="button"
                onClick={exportJson}
                title={t("downloadJsonTitle")}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                <Download width={14} height={14} />
                {t("downloadJson")}
              </button>
            </div>
          </div>

          {preview === "preview" ? (
            <article className="min-w-0 max-w-2xl rounded-card border border-line bg-surface p-6 sm:p-8">
              <h1 className="text-2xl font-semibold leading-tight tracking-tight text-navy-800 sm:text-3xl">
                {brief.h1 || brief.titleTag}
              </h1>
              {brief.metaDescription && (
                <p className="mt-3 text-lg leading-relaxed text-muted">{brief.metaDescription}</p>
              )}
              {hero && (
                <div className="mt-6">
                  <FigureView fig={hero} onRemove={() => setHero(null)} removeLabel={t("removeImage")} />
                </div>
              )}
              <div className="mt-8">
                <DraftPreview
                  blocks={draft.blocks}
                  fills={fills}
                  onPick={openPicker}
                  onRemove={(i) => setFills((f) => {
                    const next = { ...f };
                    delete next[i];
                    return next;
                  })}
                  t={t}
                />
              </div>
              <DraftFaq faq={draft.faq} heading={t("faqHeading")} />
            </article>
          ) : (
            <pre className="max-h-[32rem] overflow-auto rounded-card border border-line bg-onyx px-5 py-4 font-mono text-xs leading-relaxed text-onyx-ink">
              {JSON.stringify(draftToArticle(brief, composed, draft.faq, t("articleAuthor"), t("articleRole"), t("articleCategory")), null, 2)}
            </pre>
          )}

          {canRefine && <RefineBar onRefine={refine} />}

          <PromptDisclosure prompt={data.meta.prompt} />
        </div>
      )}

      {/* Creative-library image picker (layer 2) */}
      <Modal
        open={picker !== null}
        onClose={() => setPicker(null)}
        size="lg"
        title={t("pickerTitle")}
        description={t("pickerBody")}
      >
        {!libLoaded ? (
          <p className="py-8 text-center text-sm text-muted">{t("pickerLoading")}</p>
        ) : library.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t("pickerEmpty")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {library.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={inserting}
                onClick={() => void chooseCreative(c)}
                className="group overflow-hidden rounded-card border border-line text-left transition-colors hover:border-brand-400 disabled:opacity-60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(c.id)} alt={c.prompt} className="aspect-square w-full object-cover" loading="lazy" />
                <p className="line-clamp-2 px-2.5 py-2 text-xs text-navy-700">{c.prompt}</p>
              </button>
            ))}
          </div>
        )}
        {inserting && <p className="mt-3 text-center text-xs text-muted">{t("inserting")}</p>}
      </Modal>
    </div>
  );
}
