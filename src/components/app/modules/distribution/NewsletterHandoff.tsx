/** Newsletter channel handoff: split the variant into a subject + body, validate
 *  the subject length on its own budget, then copy a paste-ready newsletter
 *  (subject + body + UTM'd CTA) or download a self-contained HTML email. The
 *  subject + body stay derived from the (possibly AI-edited) variant text — no
 *  separate state to drift, so the AI repurpose action keeps driving this.
 *
 *  Statically imported, unlike the Insights panel: this renders on first paint for
 *  the Newsletter card, so a dynamic() wrapper would buy a skeleton flash for no
 *  bundle win (the same call CampaignsClient made for ReportView). */
"use client";

import { Check, Copy, Download, Info } from "@/components/icons";
import type { SourceArticle } from "@/lib/distribution/sample";
import { NEWSLETTER_CHANNEL } from "@/lib/distribution/publish";
import { campaignSlug } from "@/lib/distribution/utm";
import {
  checkSubject,
  NEWSLETTER_SUBJECT_MAX,
  newsletterHtml,
  newsletterPlainText,
  splitNewsletter,
} from "@/lib/distribution/newsletter";
import { useProject } from "@/lib/projects/context";
import { useCopyFeedback } from "@/lib/useCopyFeedback";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { reportDistributionPublish } from "./report-publish";

const T = {
  cs: {
    heading: "Předání do newsletteru",
    subjectLabel: "Předmět {n}/{max}",
    noSubject: "Bez předmětu",
    subjectEmpty: "Doplňte předmět. První řádek by měl začínat „Předmět:“.",
    subjectTooLong: "Předmět je delší než {max} znaků. V doručené poště se může oříznout.",
    copyNewsletter: "Kopírovat pro newsletter",
    copied: "Zkopírováno",
    downloadHtml: "Stáhnout HTML",
  },
  en: {
    heading: "Newsletter handoff",
    subjectLabel: "Subject {n}/{max}",
    noSubject: "No subject",
    subjectEmpty: "Add a subject. The first line should start with “Subject:”.",
    subjectTooLong: "Subject is longer than {max} characters. It may be clipped in the inbox.",
    copyNewsletter: "Copy for newsletter",
    copied: "Copied",
    downloadHtml: "Download HTML",
  },
} as const;

export default function NewsletterHandoff({
  text,
  ctaUrl,
  source,
  onHandoff,
}: {
  text: string;
  ctaUrl: string;
  source: SourceArticle;
  /** advance the parent variant's persisted status — the email left the app */
  onHandoff: () => void;
}) {
  const t = useT(T);
  const { copied, copy } = useCopyFeedback();
  const project = useProject();
  // The email is a real deliverable that leaves the app, so its chrome (CTA,
  // subject label, <html lang>) follows the project's locale — not a baked-in cs.
  const { locale } = useLocale();

  const { subject, body } = splitNewsletter(text);
  const subjectCheck = checkSubject(subject);

  const copyNewsletter = () => {
    void copy(newsletterPlainText({ subject, body, ctaUrl, locale })).then(() => {
      reportDistributionPublish("copyNewsletter", NEWSLETTER_CHANNEL, project.id);
      onHandoff();
    });
  };

  const downloadHtml = () => {
    const html = newsletterHtml({ subject, body, ctaUrl, locale });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `newsletter-${campaignSlug(source) || "clanek"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
    reportDistributionPublish("downloadNewsletter", NEWSLETTER_CHANNEL, project.id);
    onHandoff();
  };

  const subjectHint =
    subjectCheck.status === "empty"
      ? t("subjectEmpty")
      : subjectCheck.status === "tooLong"
        ? t("subjectTooLong", { max: subjectCheck.max })
        : null;

  return (
    <div className="mt-3 rounded-lg border border-line bg-canvas px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">{t("heading")}</span>
        <span
          className={`tnum text-[0.7rem] ${subjectCheck.status === "ok" ? "text-muted" : "text-negative"}`}
        >
          {t("subjectLabel", { n: subjectCheck.length, max: NEWSLETTER_SUBJECT_MAX })}
        </span>
      </div>

      <p className="mt-1.5 truncate text-sm font-medium text-navy-800" title={subject || undefined}>
        {subject || <span className="italic text-muted">{t("noSubject")}</span>}
      </p>

      {subjectHint ? (
        <p className="mt-1 flex items-center gap-1.5 text-[0.7rem] text-negative">
          <Info width={12} height={12} className="shrink-0" />
          {subjectHint}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyNewsletter}
          disabled={!subjectCheck.valid || body.trim().length < 2}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copied ? <Check width={14} height={14} className="text-positive" /> : <Copy width={14} height={14} />}
          <span>{copied ? t("copied") : t("copyNewsletter")}</span>
        </button>
        <button
          type="button"
          onClick={downloadHtml}
          disabled={!subjectCheck.valid || body.trim().length < 2}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download width={14} height={14} />
          <span>{t("downloadHtml")}</span>
        </button>
      </div>
    </div>
  );
}
