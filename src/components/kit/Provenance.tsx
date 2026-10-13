/** Where a number came from, said on the number (ADR-0014, ADR-0017). Every
 *  figure the product shows is one of these, and the UI never shows a figure it
 *  did not read: `sample` and `stylised` are labelled as such, in words. */

export type ProvenanceSource = "live" | "api" | "import" | "manual" | "sample" | "stylised";

const DOT: Record<ProvenanceSource, string> = {
  live: "bg-positive",
  api: "bg-positive",
  import: "bg-s-blue",
  manual: "bg-s-yellow",
  sample: "bg-muted",
  stylised: "bg-s-violet",
};

export default function Provenance({ source, label }: { source: ProvenanceSource; label: string }) {
  return (
    <span
      data-provenance={source}
      className="inline-flex items-center gap-2 rounded-[2px] border border-hair px-2 py-0.5 font-mono text-xs uppercase tracking-[0.08em] text-muted"
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[source]}`} />
      {label}
    </span>
  );
}
