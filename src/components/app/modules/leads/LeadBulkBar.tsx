"use client";

/** Bulk actions over the selected rows. Two of the three are destructive-adjacent
 *  and are treated as such: an export carries real PII out of the product (so it is
 *  a deliberate button, not a hover affordance), and erasure is GDPR Art. 17 — it
 *  runs behind a confirm dialog that says in words what survives (an anonymous
 *  funnel skeleton) and what does not (the person and their whole timeline). */
import { useState } from "react";
import { Button } from "@/components/ui";
import Modal from "@/components/app/Modal";
import { useT } from "@/lib/i18n/client";
import { downloadText, exportFilename, toCsv } from "@/lib/export";
import { sourceLabel } from "@/lib/leads/aggregate";
import { TAG_MAX, type Contact } from "@/lib/leads/types";
import { STAGE_T } from "./copy";
import type { LeadsApi } from "./useLeads";

const T = {
  cs: {
    count: "{n} vybráno",
    tag: "Přiřadit štítek",
    tagTitle: "Přiřadit štítek",
    tagPlaceholder: "např. střecha-2026",
    tagSave: "Přiřadit",
    export: "Exportovat",
    erase: "Smazat (GDPR)",
    eraseTitle: "Smazat na žádost subjektu údajů?",
    eraseBody:
      "Smaže se jméno, e-mail, telefon i celá časová osa vybraných kontaktů ({n}). Zůstane anonymní kostra pro statistiky trychtýře (fáze, zdroj, časy) — GDPR nevyžaduje zničení anonymních statistik a mazání řádku by tiše přepsalo historická čísla v Kvalitě leadů. Akce je nevratná.",
    eraseConfirm: "Smazat nevratně",
    cancel: "Zrušit",
    sampleNote: "Ukázková data — zápisy jsou vypnuté.",
    hName: "Jméno", hEmail: "E-mail", hPhone: "Telefon", hCompany: "Firma",
    hStage: "Fáze", hSource: "Zdroj", hGrade: "Skóre", hFirstSeen: "První kontakt",
  },
  en: {
    count: "{n} selected",
    tag: "Add a tag",
    tagTitle: "Add a tag",
    tagPlaceholder: "e.g. roofing-2026",
    tagSave: "Add",
    export: "Export",
    erase: "Erase (GDPR)",
    eraseTitle: "Erase on the data subject's request?",
    eraseBody:
      "This clears the name, email, phone and the entire timeline of the selected contacts ({n}). An anonymous funnel skeleton stays (stage, source, timestamps) — GDPR does not require destroying anonymous statistics, and deleting the row would silently rewrite historic numbers in Lead quality. This cannot be undone.",
    eraseConfirm: "Erase permanently",
    cancel: "Cancel",
    sampleNote: "Sample data — writes are off.",
    hName: "Name", hEmail: "Email", hPhone: "Phone", hCompany: "Company",
    hStage: "Stage", hSource: "Source", hGrade: "Score", hFirstSeen: "First seen",
  },
} as const;

export default function LeadBulkBar({
  api,
  selected,
  rows,
  onDone,
}: {
  api: LeadsApi;
  selected: Set<string>;
  rows: Contact[];
  onDone: () => void;
}) {
  const t = useT(T);
  const stage = useT(STAGE_T);
  const [tagOpen, setTagOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);

  const picked = rows.filter((c) => selected.has(c.id));

  const exportCsv = () => {
    const headers = [
      t("hName"), t("hEmail"), t("hPhone"), t("hCompany"),
      t("hStage"), t("hSource"), t("hGrade"), t("hFirstSeen"),
    ];
    const body = picked.map((c) => [
      c.name ?? "", c.email ?? "", c.phone ?? "", c.companyName ?? "",
      stage(c.stage), sourceLabel(c.attribution), c.score?.grade ?? "", c.firstSeenAt,
    ]);
    downloadText(exportFilename("leady", String(picked.length)), toCsv(headers, body));
  };

  const applyTag = async () => {
    const value = tag.trim().slice(0, TAG_MAX);
    if (!value) return;
    setBusy(true);
    for (const c of picked) {
      await api.patch(c.id, { tags: [...new Set([...c.tags, value])] });
    }
    setBusy(false);
    setTag("");
    setTagOpen(false);
    onDone();
  };

  const eraseAll = async () => {
    setBusy(true);
    for (const c of picked) await api.erase(c.id);
    setBusy(false);
    setEraseOpen(false);
    onDone();
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-brand-200 bg-brand-50 px-4 py-2.5">
      <span className="text-sm font-semibold text-brand-800">{t("count", { n: picked.length })}</span>
      <Button size="sm" variant="ghost" onClick={() => setTagOpen(true)} disabled={!api.live}>
        {t("tag")}
      </Button>
      <Button size="sm" variant="ghost" onClick={exportCsv}>
        {t("export")}
      </Button>
      <button
        type="button"
        onClick={() => setEraseOpen(true)}
        disabled={!api.live}
        className="rounded-pill px-3 py-1.5 text-sm font-medium text-negative transition-colors hover:bg-negative-soft disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t("erase")}
      </button>
      {!api.live && <span className="text-xs text-muted">{t("sampleNote")}</span>}

      <Modal open={tagOpen} onClose={() => setTagOpen(false)} title={t("tagTitle")}>
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          maxLength={TAG_MAX}
          placeholder={t("tagPlaceholder")}
          aria-label={t("tagTitle")}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800 outline-none focus:border-brand-400"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setTagOpen(false)}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={applyTag} disabled={busy || !tag.trim()}>
            {t("tagSave")}
          </Button>
        </div>
      </Modal>

      <Modal open={eraseOpen} onClose={() => setEraseOpen(false)} title={t("eraseTitle")}>
        <p className="text-sm leading-relaxed text-muted">{t("eraseBody", { n: picked.length })}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEraseOpen(false)}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={eraseAll} disabled={busy}>
            {t("eraseConfirm")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
