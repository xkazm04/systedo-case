"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProject } from "@/lib/projects/context";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import { ArrowRight, Check, Plus, Sparkles } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import Modal from "@/components/app/Modal";
import { useAiTool } from "@/components/ai/useAiTool";
import { LoadingTimer, TimeoutState, ToolError, inputClass } from "@/components/ai/primitives";
import type { OnboardingScanResult } from "@/lib/ai-types";
import type { ProjectType } from "@/lib/projects/types";
import type { OnboardingProgress } from "@/lib/onboarding/progress";

type EditableProfile = OnboardingScanResult;

const EMPTY: EditableProfile = {
  businessName: "",
  summary: "",
  offering: "",
  audience: "",
  toneOfVoice: "",
  keywords: [],
  competitors: [],
};

const TYPE_LABEL: Record<ProjectType, { cs: string; en: string }> = {
  eshop: { cs: "E-shop", en: "E-commerce" },
  app: { cs: "Aplikace / SaaS", en: "App / SaaS" },
  leadgen: { cs: "Poptávky", en: "Lead-gen" },
  content: { cs: "Obsahový web", en: "Content" },
  local: { cs: "Lokální podnik", en: "Local business" },
};

const T = {
  cs: {
    welcome: "Vítejte! Pojďme naplnit aplikaci vaší firmou",
    welcomeBody:
      "Naskenujeme váš web, zjistíme, co prodáváte a komu, a tím naladíme AI i všechny moduly na vaši firmu, místo ukázkových dat.",
    scanTitle: "Naskenovat web",
    urlLabel: "Adresa vašeho webu",
    urlPlaceholder: "vasefirma.cz",
    scanCta: "Naskenovat",
    scanning: "Skenuji web…",
    scanNote: "Načteme jen veřejný text vaší úvodní stránky. Nic nepublikujeme.",
    reviewTitle: "Zkontrolujte profil a upravte, co nesedí",
    reviewBody: "Až budete spokojení, vyberte Použít. Tím naplníme aplikaci.",
    fallbackBadge: "Základní profil",
    fallbackNote:
      "Sestaveno bez AI jen z adresy a popisu vašeho webu. Krok můžete dokončit hned. Po připojení AI získáte plný sken na míru.",
    fName: "Název firmy",
    fSummary: "Čím se firma zabývá",
    fOffering: "Co prodáváte / nabízíte",
    fAudience: "Cílové publikum",
    fTone: "Tón komunikace",
    fKeywords: "Klíčová slova",
    fCompetitors: "Konkurenti (návrhy: potvrďte nebo upravte)",
    addPlaceholder: "Přidat a Enter",
    suggestedType: "Navrhovaný typ",
    typeAlready: "už používáte",
    applyType: "Použít navrhovaný typ",
    typeConfirmTitle: "Změnit typ projektu?",
    typeConfirmBody:
      "Změníme typ projektu na „{type}“. Tím se přizpůsobí levé menu i dostupné moduly vaší firmě. Nic nemažeme. Mění se jen to, co je vidět. Typ můžete kdykoli změnit v nastavení.",
    typeConfirmCta: "Ano, změnit typ",
    typeChanging: "Měním…",
    typeError: "Změna typu se nepodařila. Zkuste to prosím znovu.",
    cancel: "Zrušit",
    apply: "Použít a naplnit aplikaci",
    applying: "Ukládám…",
    rescan: "Přeskenovat",
    appliedTitle: "Hotovo. Aplikace mluví vaší firmou.",
    appliedBody:
      "Profil jsme uložili a naplnili z něj konkurenci i podklady, ze kterých čerpají všechny moduly (report, sociální sítě, kanály zdarma).",
    checklistTitle: "Připojení dat",
    checklistBody: "Čím víc připojíte, tím přesnější budou čísla i doporučení. Kroky se odškrtnou samy.",
    done: "Hotovo",
    optionalStep: "Volitelné: funguje s ukázkovými daty",
    connect: "Připojit",
    toOverview: "Přejít na přehled projektu",
    saveError: "Uložení se nepodařilo. Zkuste to prosím znovu.",
    stepsDone: "{done} / {total} hotovo",
    chipRemove: "Odebrat {value}",
    chipAdd: "Přidat",
    errUnauthorized: "Nejste přihlášeni. Přihlaste se prosím znovu.",
    errNotFound: "Projekt se nenašel.",
    errInvalidScan: "Profil ze skenu je neúplný. Zkontrolujte pole a zkuste to znovu.",
  },
  en: {
    welcome: "Welcome! Let's seed the app with your business",
    welcomeBody:
      "We'll scan your website, learn what you sell and to whom, and tune the AI and every module to your business, instead of sample data.",
    scanTitle: "Scan your website",
    urlLabel: "Your website address",
    urlPlaceholder: "yourbusiness.com",
    scanCta: "Scan",
    scanning: "Scanning the site…",
    scanNote: "We only read your homepage's public text. Nothing is published.",
    reviewTitle: "Review the profile and fix anything that's off",
    reviewBody: "When it looks right, select Apply. We'll seed the app from it.",
    fallbackBadge: "Basic profile",
    fallbackNote:
      "Built without AI, only from your site's address and description. You can finish this step now. Connect AI for a full tailored scan.",
    fName: "Business name",
    fSummary: "What the business does",
    fOffering: "What you sell / offer",
    fAudience: "Target audience",
    fTone: "Tone of voice",
    fKeywords: "Keywords",
    fCompetitors: "Competitors (suggestions: confirm or edit)",
    addPlaceholder: "Add and press Enter",
    suggestedType: "Suggested type",
    typeAlready: "already in use",
    applyType: "Use the suggested type",
    typeConfirmTitle: "Change the project type?",
    typeConfirmBody:
      "We'll change the project type to “{type}”. That adapts the sidebar and the available modules to your business. Nothing is deleted. Only what's shown changes. You can change the type anytime in settings.",
    typeConfirmCta: "Yes, change the type",
    typeChanging: "Changing…",
    typeError: "Changing the type failed. Please try again.",
    cancel: "Cancel",
    apply: "Apply and seed the app",
    applying: "Saving…",
    rescan: "Re-scan",
    appliedTitle: "Done. The app now speaks your business.",
    appliedBody:
      "We saved the profile and seeded your competitors and the grounding every module reads (report, social, free channels).",
    checklistTitle: "Connect your data",
    checklistBody: "The more you connect, the sharper the numbers and advice. Steps tick off on their own.",
    done: "Done",
    optionalStep: "Optional: works with sample data",
    connect: "Connect",
    toOverview: "Go to the project overview",
    saveError: "Saving failed. Please try again.",
    stepsDone: "{done} / {total} done",
    chipRemove: "Remove {value}",
    chipAdd: "Add",
    errUnauthorized: "You are not signed in. Please sign in again.",
    errNotFound: "Project not found.",
    errInvalidScan: "The scan profile is incomplete. Check the fields and try again.",
  },
} as const;

type TKey = keyof (typeof T)["cs"];

/** Map an onboarding-route error `code` to localized copy, falling back to the
 *  generic save error for an unknown/absent code. */
function errorText(t: (key: TKey, vars?: Record<string, string | number>) => string, code?: string): string {
  const byCode: Record<string, TKey> = {
    unauthorized: "errUnauthorized",
    "not-found": "errNotFound",
    "invalid-scan": "errInvalidScan",
  };
  const key = code ? byCode[code] : undefined;
  return t(key ?? "saveError");
}

/** The Start module: a website-scan → review → apply flow that seeds the app with
 *  the user's real business, plus a type-aware connector checklist that self-completes. */
export default function OnboardingModule({
  projectType,
  defaultUrl,
  progress,
}: {
  projectType: ProjectType;
  defaultUrl: string;
  progress: OnboardingProgress;
}) {
  const project = useProject();
  const router = useRouter();
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";

  const [mode, setMode] = useState<"scan" | "review" | "applied">(
    progress.scanApplied ? "applied" : "scan"
  );
  const [url, setUrl] = useState(defaultUrl);
  const [profile, setProfile] = useState<EditableProfile>(progress.scan ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Scope the persistence slot to THIS project. The onboarding-scan result is
  // per-project business data; a global (mode-only) slot let a new project's Start
  // wizard restore a DIFFERENT project's scanned profile on mount and seed its
  // competitors / AI grounding with the wrong client's data (cross-project bleed).
  const ai = useAiTool<OnboardingScanResult>("onboarding-scan", project.id);

  // When a fresh scan completes, copy it into the editable review form — once, during
  // render (React's "adjust state on prop change"), rather than in an effect. Doing it
  // in an effect cost a cascading render and tripped react-hooks/set-state-in-effect;
  // keying on the result object means a NEW scan re-seeds the form while the user's own
  // edits to the current one stick.
  const scanned = ai.status === "done" ? ai.data?.result ?? null : null;
  const [seededScan, setSeededScan] = useState<OnboardingScanResult | null>(null);
  if (scanned && scanned !== seededScan && mode === "scan") {
    setSeededScan(scanned);
    setProfile(scanned);
    setMode("review");
  }

  const runScan = () => {
    const u = url.trim();
    if (u.length < 3) return;
    setSaveError(null);
    ai.run({ url: u, projectType, brand: project.name });
  };

  const apply = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan: { ...profile, scannedUrl: url.trim() } }),
      });
      if (!res.ok) {
        // The server returns a stable `code`; map it to localized copy so an `en`
        // user never sees the Czech server `error` string. Unknown code → generic.
        const json = (await res.json().catch(() => ({}))) as { code?: string };
        setSaveError(errorText(t, json.code));
        return;
      }
      setMode("applied");
      router.refresh();
    } catch {
      setSaveError(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const rescan = () => {
    ai.reset();
    setMode("scan");
  };

  const set = <K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));

  return (
    <div className="stagger space-y-6">
      {/* Welcome */}
      <div className="flex items-start gap-3 rounded-card border border-brand-200 bg-brand-50 px-5 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-700 text-white">
          <Sparkles width={20} height={20} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-navy-800">{t("welcome")}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{t("welcomeBody")}</p>
        </div>
      </div>

      {/* Scan / review / applied */}
      {mode === "scan" && (
        <div className="card space-y-4 p-6">
          <h3 className="text-base font-semibold text-navy-800">{t("scanTitle")}</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="text-sm font-medium text-navy-800">{t("urlLabel")}</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runScan()}
                placeholder={t("urlPlaceholder")}
                className={`mt-1.5 ${inputClass}`}
              />
            </label>
            <button
              type="button"
              onClick={runScan}
              disabled={ai.status === "loading" || url.trim().length < 3}
              className="inline-flex items-center justify-center gap-2 rounded-pill bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles width={16} height={16} className={ai.status === "loading" ? "animate-pulse" : ""} />
              {ai.status === "loading" ? t("scanning") : t("scanCta")}
            </button>
          </div>
          <p className="text-xs text-muted">{t("scanNote")}</p>
          {ai.status === "loading" && <LoadingTimer expectedMs={ai.expectedMs} />}
          {ai.status === "error" &&
            (ai.timedOut ? (
              <TimeoutState onRetry={runScan} />
            ) : (
              <ToolError message={ai.error ?? ""} onRetry={runScan} retryIn={ai.retryIn} upgradeUrl={ai.upgradeUrl} />
            ))}
        </div>
      )}

      {mode === "review" && (
        <div className="card space-y-5 p-6">
          <div>
            <h3 className="text-base font-semibold text-navy-800">{t("reviewTitle")}</h3>
            <p className="mt-1 text-sm text-muted">{t("reviewBody")}</p>
          </div>

          {profile.source === "fallback" && (
            <FallbackNote badge={t("fallbackBadge")} note={t("fallbackNote")} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("fName")}>
              <input value={profile.businessName} onChange={(e) => set("businessName", e.target.value)} className={inputClass} />
            </Field>
            <Field label={t("fTone")}>
              <input value={profile.toneOfVoice} onChange={(e) => set("toneOfVoice", e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label={t("fSummary")}>
            <textarea
              value={profile.summary}
              onChange={(e) => set("summary", e.target.value)}
              rows={2}
              className={`${inputClass} resize-y`}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("fOffering")}>
              <input value={profile.offering} onChange={(e) => set("offering", e.target.value)} className={inputClass} />
            </Field>
            <Field label={t("fAudience")}>
              <input value={profile.audience} onChange={(e) => set("audience", e.target.value)} className={inputClass} />
            </Field>
          </div>

          <ChipEditor
            label={t("fKeywords")}
            values={profile.keywords}
            onChange={(v) => set("keywords", v)}
            addPlaceholder={t("addPlaceholder")}
            tone="brand"
            removeLabel={(v) => t("chipRemove", { value: v })}
            addLabel={t("chipAdd")}
          />
          <ChipEditor
            label={t("fCompetitors")}
            values={profile.competitors}
            onChange={(v) => set("competitors", v)}
            addPlaceholder={t("addPlaceholder")}
            tone="navy"
            removeLabel={(v) => t("chipRemove", { value: v })}
            addLabel={t("chipAdd")}
          />

          <SuggestedType
            suggested={profile.suggestedType}
            currentType={project.type}
            projectId={project.id}
          />

          {saveError && <p className="text-sm text-negative">{saveError}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={apply}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-pill bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
            >
              <Check width={16} height={16} />
              {saving ? t("applying") : t("apply")}
            </button>
            <button
              type="button"
              onClick={rescan}
              className="text-sm font-medium text-muted transition-colors hover:text-navy-800"
            >
              {t("rescan")}
            </button>
          </div>
        </div>
      )}

      {mode === "applied" && (
        <div className="card space-y-4 p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-positive-soft text-positive">
              <Check width={18} height={18} />
            </span>
            <div>
              <h3 className="text-base font-semibold text-navy-800">{t("appliedTitle")}</h3>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{t("appliedBody")}</p>
            </div>
          </div>
          {profile.source === "fallback" && (
            <FallbackNote badge={t("fallbackBadge")} note={t("fallbackNote")} />
          )}
          {(profile.summary || profile.offering) && (
            <div className="rounded-card border border-line bg-canvas px-4 py-3 text-sm text-navy-700">
              {profile.summary && <p className="leading-relaxed">{profile.summary}</p>}
              {profile.keywords.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {profile.keywords.slice(0, 10).map((k) => (
                    <span key={k} className="pill bg-brand-50 text-brand-700">
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <SuggestedType
            suggested={profile.suggestedType}
            currentType={project.type}
            projectId={project.id}
          />
          <button
            type="button"
            onClick={rescan}
            className="text-sm font-medium text-muted transition-colors hover:text-navy-800"
          >
            {t("rescan")}
          </button>
        </div>
      )}

      {/* Connector checklist */}
      <div className="card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-navy-800">{t("checklistTitle")}</h3>
            <p className="mt-1 text-sm text-muted">{t("checklistBody")}</p>
          </div>
          <span className="pill shrink-0 bg-navy-50 text-muted">
            {t("stepsDone", { done: progress.done, total: progress.total })}
          </span>
        </div>
        <ul className="mt-4 divide-y divide-line">
          {progress.steps.map((s) => {
            const isScan = s.key === "scan";
            const done = isScan ? mode === "applied" || s.done : s.done;
            return (
              <li key={s.key} className="flex items-center gap-3 py-3">
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                    done ? "bg-positive-soft text-positive" : "bg-brand-50 text-brand-accent"
                  }`}
                >
                  {done ? <Check width={16} height={16} /> : <ModuleIcon icon={s.icon} width={16} height={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-navy-800">
                      {L === "en" ? s.labelEn : s.labelCs}
                    </span>
                    {s.optional && !done && (
                      <span className="rounded-pill bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-muted">
                        {t("optionalStep")}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted">{L === "en" ? s.hintEn : s.hintCs}</span>
                </span>
                {done ? (
                  <span className="shrink-0 text-xs font-semibold text-positive">{t("done")}</span>
                ) : isScan ? null : (
                  <Link
                    href={`/app/${project.id}/${s.to}`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
                  >
                    {t("connect")}
                    <ArrowRight width={13} height={13} />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <Link
        href={`/app/${project.id}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-accent hover:text-brand-800"
      >
        {t("toOverview")}
        <ArrowRight width={16} height={16} />
      </Link>
    </div>
  );
}

/** Renders the scan's suggested project type. When it differs from the project's
 *  current type, it offers an explicit, confirm-gated button that PATCHes
 *  project.type — never automatic. The confirm dialog explains that the sidebar +
 *  modules will adapt (nothing is deleted). When the suggestion already matches the
 *  current type, it shows a read-only "already in use" note. */
function SuggestedType({
  suggested,
  currentType,
  projectId,
}: {
  suggested?: string;
  currentType: ProjectType;
  projectId: string;
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";
  const [confirming, setConfirming] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!suggested) return null;
  const label = TYPE_LABEL[suggested as ProjectType]?.[L] ?? suggested;
  const isDifferent = suggested !== currentType;

  const changeType = async () => {
    setChanging(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: suggested }),
      });
      if (!res.ok) throw new Error();
      setConfirming(false);
      router.refresh();
    } catch {
      setError(t("typeError"));
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>
        {t("suggestedType")}: <span className="font-semibold text-navy-800">{label}</span>
        {!isDifferent && <span className="ml-1">({t("typeAlready")})</span>}
      </span>
      {isDifferent && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1 rounded-pill border border-brand-200 px-3 py-1 text-xs font-semibold text-brand-accent transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          {t("applyType")}
          <ArrowRight width={12} height={12} />
        </button>
      )}
      <Modal
        open={confirming}
        onClose={() => (changing ? undefined : setConfirming(false))}
        title={t("typeConfirmTitle")}
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={changing}
              className="text-sm font-medium text-muted transition-colors hover:text-navy-800 disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={changeType}
              disabled={changing}
              className="inline-flex items-center gap-2 rounded-pill bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
            >
              <Check width={15} height={15} />
              {changing ? t("typeChanging") : t("typeConfirmCta")}
            </button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-navy-700">
          {t("typeConfirmBody", { type: label })}
        </p>
        {error && <p className="mt-3 text-sm text-negative">{error}</p>}
      </Modal>
    </div>
  );
}

/** The honest "basic profile, no AI" label shown over a keyless-fallback scan
 *  result (source: "fallback") — the profile is domain-derived and usable, but it
 *  is not the full model scan and must not read as one. */
function FallbackNote({ badge, note }: { badge: string; note: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-canvas px-4 py-2.5 text-xs text-muted">
      <span className="rounded-pill bg-navy-50 px-2.5 py-0.5 text-[11px] font-semibold text-navy-700">
        {badge}
      </span>
      <span>{note}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-navy-800">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/** A removable-chip list with an add-on-Enter input. */
function ChipEditor({
  label,
  values,
  onChange,
  addPlaceholder,
  tone,
  removeLabel,
  addLabel,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  addPlaceholder: string;
  tone: "brand" | "navy";
  /** localized aria-label for a chip's remove button, given the chip value */
  removeLabel: (value: string) => string;
  /** localized aria-label for the add button */
  addLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const chipClass = tone === "brand" ? "bg-brand-50 text-brand-700" : "bg-navy-50 text-navy-700";

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft("");
  };

  return (
    <div>
      <span className="text-sm font-medium text-navy-800">{label}</span>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {values.map((v) => (
          <span key={v} className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-medium ${chipClass}`}>
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={removeLabel(v)}
              className="opacity-60 transition-opacity hover:opacity-100"
            >
              ×
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={addPlaceholder}
            className="w-36 rounded-pill border border-dashed border-line bg-transparent px-3 py-1 text-xs text-navy-800 placeholder:text-muted focus:border-brand-400 focus:outline-none"
          />
          {draft.trim() && (
            <button type="button" onClick={add} aria-label={addLabel} className="text-brand-accent">
              <Plus width={14} height={14} />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
