/** SPECIMEN — the five steps as a CONTACT SHEET.
 *
 *  Five frames down a strip, each holding the product's REAL output for that
 *  step of the demo project (the same data HomePathWalkthrough reads), not a
 *  sentence about it. A contact sheet is how a photographer reads a roll at a
 *  glance; a reader gets the whole path in one column without opening anything. */

export interface Frame {
  title: string;
  /** the real output shown in the frame — short, mono */
  out: string;
  /** optional trailing detail in muted text */
  more?: string;
}

export default function ExhibitSheet({ frames }: { frames: Frame[] }) {
  return (
    <ol className="divide-y divide-onyx-line">
      {frames.map((f, i) => (
        <li key={f.title} className="grid grid-cols-[2.5rem_1fr] gap-3 px-5 py-4">
          <span className="tnum pt-0.5 font-mono text-[12px] tracking-[0.16em] text-brand-300">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{f.title}</p>
            <p className="mt-1.5 truncate rounded-md border border-onyx-line bg-onyx/60 px-2.5 py-1.5 font-mono text-[12px] text-onyx-ink">
              {f.out}
            </p>
            {f.more && <p className="mt-1.5 text-[12px] leading-snug text-onyx-muted">{f.more}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
