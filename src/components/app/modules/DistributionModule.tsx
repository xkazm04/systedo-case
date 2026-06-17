/** Distribuce — one article repurposed across channels + per-channel attribution.
 *  Server component. */
import { Pill } from "@/components/ui";
import { Document } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import { fmtInt, fmtPct } from "@/lib/format";
import { repurpose } from "@/lib/distribution/generate";
import type { ChannelPerf, SourceArticle } from "@/lib/distribution/sample";

export default function DistributionModule({
  source,
  attribution,
}: {
  source: SourceArticle;
  attribution: ChannelPerf[];
}) {
  const variants = repurpose(source);
  const totalClicks = attribution.reduce((a, c) => a + c.clicks, 0);
  const best = attribution.reduce((a, b) => (b.clicks > a.clicks ? b : a), attribution[0]!);

  return (
    <div className="space-y-6">
      {/* source */}
      <div className="card flex items-center gap-4 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-accent">
          <Document width={22} height={22} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Zdrojový článek</p>
          <p className="truncate text-base font-semibold text-navy-800">{source.title}</p>
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="link-inline text-sm">
            {source.url.replace("https://", "")}
          </a>
        </div>
      </div>

      {/* repurposed variants */}
      <div className="grid gap-4 sm:grid-cols-2">
        {variants.map((v) => {
          const over = v.text.length > v.max;
          return (
            <div key={v.channel} className="card flex flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-navy-800">{v.channel}</span>
                <span className={`tnum text-xs ${over ? "text-negative" : "text-muted"}`}>
                  {v.text.length}/{v.max}
                </span>
              </div>
              <pre className="mt-3 flex-1 whitespace-pre-wrap rounded-lg bg-canvas px-3 py-2.5 font-sans text-sm leading-relaxed text-navy-700">
                {v.text}
              </pre>
            </div>
          );
        })}
      </div>

      {/* attribution */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-navy-800">Atribuce podle kanálu</h3>
          <Pill tone="positive">Nejvíc prokliků: {best.channel}</Pill>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Kanál</th>
                <th className="px-4 py-3 text-right font-medium">Dosah</th>
                <th className="px-4 py-3 text-right font-medium">Prokliky</th>
                <th className="px-4 py-3 text-right font-medium">CTR</th>
                <th className="px-4 py-3 text-right font-medium">Podíl</th>
              </tr>
            </thead>
            <tbody>
              {attribution.map((c) => (
                <tr key={c.channel} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">{c.channel}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(c.reach)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(c.clicks)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtPct(c.reach > 0 ? c.clicks / c.reach : 0)}</td>
                  <td className="tnum px-4 py-3 text-right font-medium text-navy-800">
                    {fmtPct(totalClicks > 0 ? c.clicks / totalClicks : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <NextSteps steps={[{ to: "socialni", label: "Naplánovat publikaci", hint: "Vydat varianty v centru sociálních sítí" }]} />
    </div>
  );
}
