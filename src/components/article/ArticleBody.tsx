import Image from "next/image";
import Link from "next/link";
import { External } from "@/components/icons";
import HeadingAnchor from "@/components/article/HeadingAnchor";
import type { Block, Inline } from "@/lib/article";

/** Renders a single inline node: plain text, internal/external/anchor link, or bold. */
function InlineNode({ node }: { node: Inline }) {
  if (typeof node === "string") return <>{node}</>;
  if ("bold" in node) return <strong className="font-semibold text-navy-800">{node.text}</strong>;

  if (node.kind === "internal") {
    return (
      <Link href={node.href} className="link-inline">
        {node.text}
      </Link>
    );
  }
  if (node.kind === "anchor") {
    return (
      <a href={node.href} className="link-inline">
        {node.text}
      </a>
    );
  }
  return (
    <a href={node.href} target="_blank" rel="noopener noreferrer" className="link-inline">
      {node.text}
      <External width={12} height={12} className="ml-0.5 inline-block -translate-y-px" />
    </a>
  );
}

function Inlines({ content }: { content: Inline[] }) {
  return (
    <>
      {content.map((node, i) => (
        <InlineNode key={i} node={node} />
      ))}
    </>
  );
}

const CALLOUT_STYLES = {
  tip: { box: "border-brand-200 bg-brand-50", title: "text-brand-800" },
  info: { box: "border-navy-200 bg-navy-50", title: "text-navy-700" },
  warn: { box: "border-coral-400/40 bg-coral-soft", title: "text-coral-600" },
} as const;

export default function ArticleBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-5 text-[1.0625rem] leading-[1.75] text-navy-700">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2":
            return <HeadingAnchor key={i} level="h2" id={block.id} text={block.text} />;
          case "h3":
            return <HeadingAnchor key={i} level="h3" id={block.id} text={block.text} />;
          case "p":
            return (
              <p key={i}>
                <Inlines content={block.content} />
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="space-y-2.5 pl-1">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
                    <span>
                      <Inlines content={item} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="space-y-2.5">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="tnum mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-onyx text-xs font-semibold text-white">
                      {j + 1}
                    </span>
                    <span className="pt-0.5">
                      <Inlines content={item} />
                    </span>
                  </li>
                ))}
              </ol>
            );
          case "callout": {
            const s = CALLOUT_STYLES[block.variant];
            return (
              <aside key={i} className={`rounded-card border ${s.box} p-5`}>
                {block.title && (
                  <p className={`text-sm font-semibold ${s.title}`}>{block.title}</p>
                )}
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-navy-700">
                  <Inlines content={block.content} />
                </p>
              </aside>
            );
          }
          case "quote":
            return (
              <blockquote
                key={i}
                className="border-l-4 border-brand-400 pl-5 text-lg italic text-navy-700"
              >
                <Inlines content={block.content} />
                {block.cite && <cite className="mt-2 block text-sm not-italic text-muted">— {block.cite}</cite>}
              </blockquote>
            );
          case "stat":
            return (
              <div key={i} className="grid gap-3 rounded-card border border-line bg-canvas p-5 sm:grid-cols-3">
                {block.items.map((s, j) => (
                  <div key={j} className="text-center sm:text-left">
                    <p className="tnum text-xl font-semibold text-navy-800">{s.value}</p>
                    <p className="mt-0.5 text-sm text-muted">{s.label}</p>
                  </div>
                ))}
              </div>
            );
          case "figure": {
            // SVGs are served as-is (the raster optimizer rejects them and they
            // need no resizing); raster sources still flow through next/image's
            // optimizer. Either way the image is lazy-loaded and the intrinsic
            // width/height reserve space to avoid layout shift.
            const isSvg = block.src.endsWith(".svg");
            return (
              <figure key={i}>
                <Image
                  src={block.src}
                  alt={block.alt}
                  width={block.width ?? 1600}
                  height={block.height ?? 900}
                  loading="lazy"
                  sizes="(min-width: 768px) 42rem, 100vw"
                  unoptimized={isSvg}
                  className="h-auto w-full rounded-card border border-line bg-surface"
                />
                {block.caption && (
                  <figcaption className="mt-3 text-center text-sm leading-relaxed text-muted">
                    {block.caption}
                  </figcaption>
                )}
              </figure>
            );
          }
          case "cta":
            return (
              <div
                key={i}
                className="flex flex-col items-start gap-4 rounded-card bg-onyx p-6 text-white sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-[0.95rem] font-medium text-onyx-ink">{block.text}</p>
                <a
                  href={block.href}
                  target={block.kind === "external" ? "_blank" : undefined}
                  rel={block.kind === "external" ? "noopener noreferrer" : undefined}
                  className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-brand-500 px-5 py-2.5 text-sm font-semibold text-navy-900 transition-colors hover:bg-brand-400"
                >
                  {block.cta}
                  <External width={15} height={15} />
                </a>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
