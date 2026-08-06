"use client";

/** C3 — the report's competitor-set control. The named rivals here flow into the AI
 *  recap (and social copy) as comparative grounding, so the narrative reads "vs. the
 *  market", not just period-over-period on own data. Names only — never invented,
 *  never fabricated competitor numbers.
 *
 *  It is also the CONFIRM step for website-scan suggestions: onboarding merges the
 *  scan's guesses in as unconfirmed `scan` entries, which are visible here but excluded
 *  from every LLM grounding line until the user keeps them. Saving IS the confirmation —
 *  whatever lines survive the save are what the user stands behind — so no separate
 *  per-row confirm control is needed. Client. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { Check } from "@/components/icons";
import { Pill } from "@/components/ui";
import {
  MAX_COMPETITORS,
  competitorSource,
  curatedCompetitors,
  isCurated,
  type Competitor,
  type CompetitorSource,
} from "@/lib/competitors/types";

const T = {
  cs: {
    active: "Narativ porovnává s trhem",
    inactive: "AI narativ zná jen vaše čísla. Přidejte konkurenty a srovnání bude „vs. trh“, ne jen období.",
    add: "Přidat konkurenty",
    edit: "Upravit",
    placeholder: "Název konkurenta",
    save: "Uložit",
    saving: "Ukládám…",
    clear: "Zrušit",
    clearConfirm: "Opravdu zrušit?",
    hint: "Jen jména (max {max}). AI je použije pro srovnání, nevymýšlí jejich čísla.",
    failed: "Uložení se nezdařilo.",
    scanBadge: "ze skenu",
    pending: "{n} návrhů ze skenu čeká na potvrzení. Do AI srovnání se dostanou až po uložení.",
    truncated: "Uloženo prvních {kept} konkurentů, {dropped} se nevešlo (limit {max}).",
  },
  en: {
    active: "Narrative compares vs. the market",
    inactive: "The AI narrative only knows your numbers. Add competitors and it reads “vs. the market”, not just period-over-period.",
    add: "Add competitors",
    edit: "Edit",
    placeholder: "Competitor name",
    save: "Save",
    saving: "Saving…",
    clear: "Remove",
    clearConfirm: "Confirm removal?",
    hint: "Names only (max {max}). AI uses them for comparison, never fabricates their numbers.",
    failed: "Save failed.",
    scanBadge: "from scan",
    pending: "{n} scan suggestions await confirmation. They reach the AI comparison only once you save.",
    truncated: "Saved the first {kept} competitors, {dropped} did not fit (limit {max}).",
  },
} as const;

export default function CompetitorEditor({
  projectId,
  initial,
}: {
  projectId: string;
  initial: Competitor[];
}) {
  const t = useT(T);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // two-step confirm for the destructive Remove (matches the report's unlink flow)
  const [confirmClear, setConfirmClear] = useState(false);
  /** One editable line per entry (name + its PROVENANCE, so a scan suggestion the user
   *  keeps stays recorded as scan-originated instead of silently becoming "manual"),
   *  plus a trailing blank to type into. */
  type Row = { name: string; source: CompetitorSource };
  const [rows, setRows] = useState<Row[]>(() => {
    const seeded: Row[] = initial.map((c) => ({ name: c.name, source: competitorSource(c) }));
    return seeded.length < MAX_COMPETITORS
      ? [...seeded, { name: "", source: "manual" }]
      : seeded;
  });

  // The narrative only ever uses CURATED entries; unconfirmed scan suggestions sit in
  // the set waiting to be kept, so the banner must count them separately or it would
  // claim a comparison the prompts are not actually making.
  const curated = curatedCompetitors(initial);
  const pending = initial.filter((c) => !isCurated(c));
  const has = curated.length > 0;

  function setAt(i: number, v: string) {
    setRows((prev) => {
      const next = prev.map((r, idx) => (idx === i ? { ...r, name: v } : r));
      // Real names only, capped at the advertised limit (counting names, not input
      // slots — the old `slice(0, 9)` counted "8 names + 1 blank" and let a filled
      // 9th slot post 9 competitors past the "max 8" copy).
      const real = next.filter((r) => r.name.trim()).slice(0, MAX_COMPETITORS);
      // Add a trailing blank to type into only while under the cap.
      return real.length < MAX_COMPETITORS ? [...real, { name: "", source: "manual" }] : real;
    });
  }

  async function save() {
    // Saving IS the confirmation: every line the user left standing is one they stand
    // behind, so it goes out `confirmed` — which is what lets a scan suggestion enter
    // the grounding line. Provenance is preserved, so "who suggested this" survives.
    const competitors = rows
      .map((r) => ({ ...r, name: r.name.trim() }))
      .filter((r) => r.name)
      .slice(0, MAX_COMPETITORS)
      .map((r) => ({ name: r.name, source: r.source, confirmed: true }));
    if (!competitors.length) return doClear();
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitors }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        warning?: { code?: string; kept?: number; dropped?: number };
      };
      if (res.ok && json.ok) {
        // A partial save is no longer silent: the route reports the coded truncation and
        // the client renders its OWN localized copy from the code (never the server text).
        if (json.warning?.code === "competitors-truncated") {
          setNotice(
            t("truncated", {
              kept: json.warning.kept ?? MAX_COMPETITORS,
              dropped: json.warning.dropped ?? 0,
              max: MAX_COMPETITORS,
            })
          );
        }
        setOpen(false);
        router.refresh();
      } else {
        setErr(json.error || t("failed"));
      }
    } catch {
      setErr(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  // First click arms the confirm; the second performs the delete. Save's "cleared to
  // empty" path calls doClear() directly (an explicit save is its own confirmation).
  function clear() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    void doClear();
  }

  async function doClear() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors`, { method: "DELETE" });
      if (res.ok) {
        setConfirmClear(false);
        setOpen(false);
        router.refresh();
      } else {
        setErr(t("failed"));
      }
    } catch {
      setErr(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-lg px-4 py-3 text-xs leading-relaxed ${has ? "bg-positive-soft text-positive" : "bg-canvas text-muted"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 font-medium">
          {has && <Check width={14} height={14} className="shrink-0" />}
          {has ? `${t("active")}: ${curated.map((c) => c.name).join(", ")}` : t("inactive")}
        </span>
        <div className="flex items-center gap-2 print:hidden">
          {err && !open && <span className="text-negative">{err}</span>}
          {notice && !open && <span className="text-muted">{notice}</span>}
          {has && (
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className={`rounded-pill border bg-surface px-3 py-1.5 font-semibold transition-colors disabled:opacity-50 ${
                confirmClear ? "border-negative text-negative" : "border-line text-navy-700 hover:border-brand-300"
              }`}
            >
              {confirmClear ? t("clearConfirm") : t("clear")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300"
          >
            {has ? t("edit") : t("add")}
          </button>
        </div>
      </div>
      {/* Unconfirmed website-scan suggestions: visible, and honestly labelled as NOT
          yet part of the AI comparison. Opening the editor and saving keeps them. */}
      {pending.length > 0 && !open && (
        <p className="mt-2 text-muted print:hidden">{t("pending", { n: pending.length })}</p>
      )}
      {open && (
        <div className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={r.name}
                onChange={(e) => setAt(i, e.target.value)}
                placeholder={t("placeholder")}
                className="min-w-0 flex-1 rounded-card border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-300 focus:outline-none"
              />
              {r.source === "scan" && <Pill tone="navy">{t("scanBadge")}</Pill>}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-pill bg-brand-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
            >
              {busy ? t("saving") : t("save")}
            </button>
            {err && <span className="text-negative">{err}</span>}
          </div>
          <p className="text-muted">{t("hint", { max: MAX_COMPETITORS })}</p>
        </div>
      )}
    </div>
  );
}
