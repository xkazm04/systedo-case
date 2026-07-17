import type { FaqItem, Inline } from "@/lib/article";
import { faqItemId } from "@/lib/article-validate";
import FaqHashOpen from "@/components/article/FaqHashOpen";
import FaqPermalink from "@/components/article/FaqPermalink";

/** The canonical FAQ accordion for the public article pages. Always carries the
 *  accessibility / deep-link / print upgrades that had accreted on /clanek only:
 *  stable per-question ids, hash auto-open + scroll (FaqHashOpen), `scroll-mt`,
 *  `print:break-inside-avoid`, and rich inline rendering (bold + links) of the
 *  answer — so a cloned copy (e.g. /clanek/vykon) can no longer silently drop them
 *  and flatten answers to plain text. `withPermalinks` toggles the per-question
 *  permalink affordance. */
export default function FaqSection({
  faq,
  heading,
  withPermalinks = true,
}: {
  faq: FaqItem[];
  heading: string;
  withPermalinks?: boolean;
}) {
  return (
    <section className="mt-12" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight text-navy-800">
        {heading}
      </h2>
      {/* Auto-open + scroll to the question a #hash targets — a deep link into a
          collapsed accordion is useless without it. */}
      <FaqHashOpen ids={faq.map(faqItemId)} />
      <div className="mt-5 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {faq.map((f) => {
          const id = faqItemId(f);
          return (
            <details
              key={id}
              id={id}
              className="group scroll-mt-24 px-5 py-4 print:break-inside-avoid [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center gap-2 font-medium text-navy-800">
                <span className="flex-1">{f.q}</span>
                {withPermalinks && <FaqPermalink id={id} question={f.q} />}
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-600 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-navy-700">
                {f.a.map((node: Inline, j) =>
                  typeof node === "string" ? (
                    <span key={j}>{node}</span>
                  ) : "bold" in node ? (
                    <strong key={j}>{node.text}</strong>
                  ) : (
                    <a
                      key={j}
                      href={node.href}
                      target={node.kind === "external" ? "_blank" : undefined}
                      rel={node.kind === "external" ? "noopener noreferrer" : undefined}
                      className="link-inline"
                    >
                      {node.text}
                    </a>
                  )
                )}
              </p>
            </details>
          );
        })}
      </div>
    </section>
  );
}
