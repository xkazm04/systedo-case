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
    hint: "Jen jména (max 8). AI je použije pro srovnání, nevymýšlí jejich čísla.",
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
    hint: "Names only (max 8). AI uses them for comparison, never fabricates their numbers.",
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
  // one editable line per name, plus a trailing blank to type into
  const [names, setNames] = useState<string[]>(() =>
    initial.length ? [...initial.map((c) => c.name), ""] : [""]
  );

  const has = initial.length > 0;

  function setAt(i: number, v: string) {
    setNames((prev) => {
      const next = [...prev];
      next[i] = v;
      // keep exactly one trailing blank
      const trimmed = next.filter((n, idx) => n.trim() || idx === next.length - 1);
      if (trimmed[trimmed.length - 1]?.trim()) trimmed.push("");
      return trimmed.slice(0, 9);
    });
  }

  async function save() {
    const competitors = names.map((n) => n.trim()).filter(Boolean).map((name) => ({ name }));
    if (!competitors.length) return clear();
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

  async function clear() {
    setBusy(true);
    try {
      await fetch(`/api/projects/${projectId}/competitors`, { method: "DELETE" });
      router.refresh();
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
          {has && (
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50"
            >
              {t("clear")}
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
          <p className="text-muted">{t("hint")}</p>
        </div>
      )}
    </div>
  );
}
