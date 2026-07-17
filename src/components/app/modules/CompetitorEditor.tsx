"use client";

/** C3 — the report's competitor-set control. The named rivals here flow into the AI
 *  recap (and social copy) as comparative grounding, so the narrative reads "vs. the
 *  market", not just period-over-period on own data. Names only — never invented,
 *  never fabricated competitor numbers. Client. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { Check } from "@/components/icons";
import type { Competitor } from "@/lib/competitors/types";

/** Advertised (and enforced) cap on named competitors. The editor never keeps more
 *  than this many real names, and the hint text is derived from it — so the "max N"
 *  copy and what Save posts can't drift apart. */
const MAX_COMPETITORS = 8;

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
  },
  en: {
    active: "Narrative compares vs. the market",
    inactive: "The AI narrative only knows your numbers. Add competitors and it reads \"vs. the market\", not just period-over-period.",
    add: "Add competitors",
    edit: "Edit",
    placeholder: "Competitor name",
    save: "Save",
    saving: "Saving…",
    clear: "Remove",
    clearConfirm: "Confirm removal?",
    hint: "Names only (max {max}). AI uses them for comparison, never fabricates their numbers.",
    failed: "Save failed.",
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
  // two-step confirm for the destructive Remove (matches the report's unlink flow)
  const [confirmClear, setConfirmClear] = useState(false);
  // one editable line per name, plus a trailing blank to type into
  const [names, setNames] = useState<string[]>(() =>
    initial.length ? [...initial.map((c) => c.name), ""] : [""]
  );

  const has = initial.length > 0;

  function setAt(i: number, v: string) {
    setNames((prev) => {
      const next = [...prev];
      next[i] = v;
      // Real names only, capped at the advertised limit (counting names, not input
      // slots — the old `slice(0, 9)` counted "8 names + 1 blank" and let a filled
      // 9th slot post 9 competitors past the "max 8" copy).
      const real = next.map((n) => n).filter((n) => n.trim()).slice(0, MAX_COMPETITORS);
      // Add a trailing blank to type into only while under the cap.
      return real.length < MAX_COMPETITORS ? [...real, ""] : real;
    });
  }

  async function save() {
    const competitors = names.map((n) => n.trim()).filter(Boolean).slice(0, MAX_COMPETITORS).map((name) => ({ name }));
    if (!competitors.length) return doClear();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitors }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
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
          {has ? `${t("active")}: ${initial.map((c) => c.name).join(", ")}` : t("inactive")}
        </span>
        <div className="flex items-center gap-2 print:hidden">
          {err && !open && <span className="text-negative">{err}</span>}
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
      {open && (
        <div className="mt-3 space-y-2">
          {names.map((n, i) => (
            <input
              key={i}
              type="text"
              value={n}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder={t("placeholder")}
              className="w-full rounded-card border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-300 focus:outline-none"
            />
          ))}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-pill bg-brand-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
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
