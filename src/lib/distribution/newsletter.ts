/** Newsletter channel handoff. The Newsletter variant is generated with a
 *  „Předmět:" subject line followed by the body; this module turns that single
 *  blob into a real subject field + body, validates the subject length
 *  separately from the body, and assembles a minimal, paste-ready HTML email
 *  (subject + body + the UTM'd CTA). Pure — no DOM, no I/O; the Blob download
 *  lives in the component. Seam: a real ESP (Mailchimp / Ecomail) template. */
import { escapeHtml } from "@/lib/html";
import { HOME_MARKET_LOCALE, LOCALES, type SupportedLocale } from "@/lib/format";

/** Soft subject-line budget. Most inbox clients truncate around here, so we warn
 *  past it rather than past the much larger body budget. */
export const NEWSLETTER_SUBJECT_MAX = 70;

/** Call-to-action label for the newsletter CTA button/link, per locale. The email
 *  the user downloads is a real deliverable that leaves the app — baking the Czech
 *  label in shipped an en-locale project a Czech call-to-action. */
export const NEWSLETTER_CTA_LABELS: Record<SupportedLocale, string> = {
  cs: "Číst celý článek",
  en: "Read the full article",
};

/** The „Předmět:" / "Subject:" line label of the plain-text handoff — same
 *  reason: it is pasted straight into an ESP by whoever downloaded it. */
export const NEWSLETTER_SUBJECT_LABELS: Record<SupportedLocale, string> = {
  cs: "Předmět",
  en: "Subject",
};

function labelFor(labels: Record<SupportedLocale, string>, locale: SupportedLocale): string {
  return labels[locale] ?? labels[HOME_MARKET_LOCALE];
}

/** The subject-line prefix the deterministic + AI Newsletter variant emits. The
 *  trailing space is optional, so we match it case-insensitively and trim.
 *
 *  Derived from {@link NEWSLETTER_SUBJECT_LABELS} rather than hardcoding „Předmět:"
 *  — once generate.ts writes the subject line in the user's locale, a parser
 *  pinned to one language would read an en variant as "no subject" and hand the
 *  whole email to the body. Every locale's label is accepted no matter which one
 *  generated the text, so switching locale mid-edit still parses. */
const SUBJECT_PREFIX = new RegExp(
  `^\\s*(?:${Object.values(NEWSLETTER_SUBJECT_LABELS)
    .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")}):\\s*`,
  "i"
);

export interface NewsletterParts {
  /** The extracted subject line (no „Předmět:" prefix, trimmed). */
  subject: string;
  /** Everything after the subject line, trimmed of leading blank lines. */
  body: string;
}

/** Split a generated Newsletter variant into a subject + body. The first line is
 *  treated as the subject when it carries the „Předmět:" prefix; otherwise the
 *  whole text is the body and the subject is empty (so the UI can prompt for one
 *  rather than silently shipping a blank subject). The body never re-includes the
 *  subject line. */
export function splitNewsletter(text: string): NewsletterParts {
  const normalized = text.replace(/\r\n/g, "\n");
  const newline = normalized.indexOf("\n");
  const firstLine = (newline === -1 ? normalized : normalized.slice(0, newline)).trim();
  const rest = newline === -1 ? "" : normalized.slice(newline + 1);

  if (SUBJECT_PREFIX.test(firstLine)) {
    return {
      subject: firstLine.replace(SUBJECT_PREFIX, "").trim(),
      body: rest.replace(/^\n+/, "").trimEnd(),
    };
  }
  // No subject marker — the whole text is the body, subject left for the user.
  return { subject: "", body: normalized.trim() };
}

export type SubjectStatus = "empty" | "ok" | "tooLong";

export interface SubjectCheck {
  length: number;
  max: number;
  status: SubjectStatus;
  /** True only for `ok` — a usable subject within budget. */
  valid: boolean;
}

/** Validate the subject length on its own budget, independent of the body. Empty
 *  and over-budget are both invalid, but distinguished so the UI can message
 *  each ("doplňte předmět" vs. "zkraťte předmět"). */
export function checkSubject(subject: string, max: number = NEWSLETTER_SUBJECT_MAX): SubjectCheck {
  const trimmed = subject.trim();
  const length = trimmed.length;
  const status: SubjectStatus = length === 0 ? "empty" : length > max ? "tooLong" : "ok";
  return { length, max, status, valid: status === "ok" };
}

export interface NewsletterHtmlInput {
  subject: string;
  body: string;
  /** The UTM-stamped article link from utm.ts — the CTA target. */
  ctaUrl: string;
  /** Locale of the generated email. Required, not defaulted: the caller always
   *  knows the active locale, and a default silently shipped Czech chrome to
   *  en-locale projects. Picks the CTA/subject labels and the `<html lang>`. */
  locale: SupportedLocale;
}

/** Assemble a paste-ready single-file HTML email: the subject as <title> + a
 *  heading, the body as paragraphs (blank-line-separated), and the UTM'd CTA as a
 *  trailing link. Self-contained inline styles so it survives a copy-paste into
 *  most ESP "paste HTML" fields. Pure string build — the Blob/download is the
 *  component's job. */
export function newsletterHtml({ subject, body, ctaUrl, locale }: NewsletterHtmlInput): string {
  const label = labelFor(NEWSLETTER_CTA_LABELS, locale);
  const safeSubject = escapeHtml(subject.trim());
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `      <p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
  const safeUrl = escapeHtml(ctaUrl.trim());

  return `<!doctype html>
<html lang="${LOCALES[locale]?.intlLocale ?? LOCALES[HOME_MARKET_LOCALE].intlLocale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeSubject}</title>
  </head>
  <body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px;">
      <tr><td>
        <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;">${safeSubject}</h1>
${paragraphs}
        <p style="margin:24px 0 0;">
          <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">${escapeHtml(label)} →</a>
        </p>
      </td></tr>
    </table>
  </body>
</html>
`;
}

/** Plain-text newsletter handoff for the "Kopírovat pro newsletter" action:
 *  „Předmět:" line + a blank line + the body + the CTA with its UTM'd URL, so a
 *  paste into any ESP carries the subject, copy and the attributable link. */
export function newsletterPlainText({ subject, body, ctaUrl, locale }: NewsletterHtmlInput): string {
  const label = labelFor(NEWSLETTER_CTA_LABELS, locale);
  const subjectLabel = labelFor(NEWSLETTER_SUBJECT_LABELS, locale);
  const lines = [`${subjectLabel}: ${subject.trim()}`, "", body.trim(), "", `${label} → ${ctaUrl.trim()}`];
  return lines.join("\n");
}
