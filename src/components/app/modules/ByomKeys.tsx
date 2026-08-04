"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "@/components/icons";
import { Pill, TONE_TEXT } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useByomConfig } from "@/components/hooks/useByomConfig";
import {
  BYOM_VENDORS,
  BYOM_VENDOR_LABELS,
  isByomValidationStale,
  type ByomVendor,
  type PublicByomConfig,
} from "@/lib/llm/keys/types";

const T = {
  cs: {
    title: "AI modely — vlastní klíče",
    subtitle: "Platí pro celý účet, napříč všemi projekty.",
    upsellTitle: "Připojte vlastní API klíče",
    upsellBody:
      "Plán Vlastní klíč odemkne neomezené AI generování přes váš vlastní klíč (OpenAI, Gemini nebo Claude) a přepínání modelů. Platíte tokeny přímo poskytovateli.",
    upsellCta: "Zobrazit ceník",
    active: "Aktivní",
    setActive: "Použít",
    disabled: "Vypnuto (aplikace)",
    useApp: "Používat providera aplikace",
    connected: "Připojeno",
    notConnected: "Nepřipojeno",
    validated: "Ověřeno",
    validatedStale: "Ověřeno dávno",
    fingerprint: "Klíč …{last4}",
    fingerprintTitle: "Poslední 4 znaky uloženého klíče — porovnejte je se seznamem klíčů u poskytovatele.",
    fingerprintUnknown: "Klíč neidentifikovaný",
    fingerprintUnknownTitle:
      "Tento klíč byl uložen dřív, než jsme začali ukládat poslední 4 znaky. Klíč nikdy nedešifrujeme jen kvůli zobrazení — identifikaci uvidíte po nahrazení klíče.",
    validatedAgo: "ověřeno {ago}",
    validatedNever: "zatím neověřeno",
    keyLabel: "API klíč",
    keyPlaceholder: "vložte API klíč",
    connect: "Připojit",
    replaceKey: "Nahradit klíč",
    saveKey: "Uložit klíč",
    cancel: "Zrušit",
    modelQuality: "Model (kvalita)",
    modelFast: "Model (rychlý)",
    saveModels: "Uložit modely",
    test: "Otestovat",
    testing: "Testuji…",
    remove: "Odebrat",
    tested: "Klíč funguje.",
    testFailed: "Test se nezdařil.",
    saving: "Ukládám…",
    errGeneric: "Něco se pokazilo.",
    errNetwork: "Nepodařilo se spojit se serverem.",
    loadError: "Nastavení AI se nepodařilo načíst.",
    retry: "Zkusit znovu",
  },
  en: {
    title: "AI models — your own keys",
    subtitle: "Applies to your whole account, across every project.",
    upsellTitle: "Connect your own API keys",
    upsellBody:
      "The Your-key plan unlocks unlimited AI generation with your own key (OpenAI, Gemini or Claude) and model switching. You pay tokens directly to the provider.",
    upsellCta: "See pricing",
    active: "Active",
    setActive: "Use",
    disabled: "Off (app provider)",
    useApp: "Use the app's provider",
    connected: "Connected",
    notConnected: "Not connected",
    validated: "Verified",
    validatedStale: "Verified long ago",
    fingerprint: "Key …{last4}",
    fingerprintTitle: "The last 4 characters of the stored key — match them against your provider's key list.",
    fingerprintUnknown: "Key unidentified",
    fingerprintUnknownTitle:
      "This key was stored before we began keeping its last 4 characters. We never decrypt a key just to display it — replace the key to make it identifiable.",
    validatedAgo: "verified {ago}",
    validatedNever: "not verified yet",
    keyLabel: "API key",
    keyPlaceholder: "paste API key",
    connect: "Connect",
    replaceKey: "Replace key",
    saveKey: "Save key",
    cancel: "Cancel",
    modelQuality: "Model (quality)",
    modelFast: "Model (fast)",
    saveModels: "Save models",
    test: "Test",
    testing: "Testing…",
    remove: "Remove",
    tested: "The key works.",
    testFailed: "Test failed.",
    saving: "Saving…",
    errGeneric: "Something went wrong.",
    errNetwork: "Could not reach the server.",
    loadError: "Couldn't load AI settings.",
    retry: "Try again",
  },
} as const;

/** Default model hints per vendor (mirrors BYOM_DEFAULT_MODELS server-side). */
const MODEL_HINTS: Record<ByomVendor, { quality: string; fast: string }> = {
  openai: { quality: "gpt-5.4-mini", fast: "gpt-5.4-mini" },
  anthropic: { quality: "claude-sonnet-5", fast: "claude-haiku-4-5" },
  gemini: { quality: "gemini-3.5-flash", fast: "gemini-3.1-flash-lite" },
  openrouter: { quality: "z-ai/glm-5.2", fast: "deepseek/deepseek-v4-flash" },
};

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800 placeholder:text-muted/70 transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";
const btnPrimary =
  "rounded-pill bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50";
const btnGhost =
  "rounded-pill border border-line px-4 py-2 text-sm font-medium text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50";

type ModelDraft = { model: string; fastModel: string };

export default function ByomKeys() {
  const t = useT(T);
  const fmt = useFormatters();
  const { status, state, patch, retry } = useByomConfig();
  const [keyDraft, setKeyDraft] = useState<Partial<Record<ByomVendor, string>>>({});
  const [showKeyInput, setShowKeyInput] = useState<Partial<Record<ByomVendor, boolean>>>({});
  const [modelDraft, setModelDraft] = useState<Partial<Record<ByomVendor, ModelDraft>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ vendor: ByomVendor; ok: boolean; text: string } | null>(null);

  // Seed the per-vendor model drafts once, when the shared config first loads.
  const seeded = useRef(false);
  useEffect(() => {
    if (!state || seeded.current) return;
    seeded.current = true;
    const md: Partial<Record<ByomVendor, ModelDraft>> = {};
    for (const k of state.config.keys) md[k.vendor] = { model: k.model ?? "", fastModel: k.fastModel ?? "" };
    setModelDraft(md);
  }, [state]);

  /** Shared mutation: applies the returned config + optional validation notice.
   *  Resolves `true` only on an HTTP-ok response, so callers (saveKey) can skip
   *  their success-only cleanup — e.g. wiping the pasted key — when it failed. */
  async function call(
    url: string,
    opts: RequestInit,
    action: string,
    vendor?: ByomVendor
  ): Promise<boolean> {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(url, opts);
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        config?: PublicByomConfig;
        validation?: { ok: boolean; error?: string };
      };
      if (!res.ok) {
        setError(json.error ?? t("errGeneric"));
        return false;
      }
      if (json.config) patch(json.config);
      if (json.validation && vendor) {
        setNotice({
          vendor,
          ok: json.validation.ok,
          text: json.validation.ok ? t("tested") : json.validation.error ?? t("testFailed"),
        });
      }
      return true;
    } catch {
      setError(t("errNetwork"));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  async function saveKey(vendor: ByomVendor) {
    const apiKey = (keyDraft[vendor] ?? "").trim();
    if (!apiKey) return;
    const ok = await call("/api/byom/keys", json({ vendor, apiKey }), `save:${vendor}`, vendor);
    // Only clear the pasted secret + collapse the input when the save actually
    // succeeded — a failed save must keep the draft so the user isn't forced to
    // re-find and re-paste the key while a top-level error banner explains why.
    if (!ok) return;
    setKeyDraft((d) => ({ ...d, [vendor]: "" }));
    setShowKeyInput((s) => ({ ...s, [vendor]: false }));
  }

  const testKey = (vendor: ByomVendor) =>
    call("/api/byom/validate", json({ vendor }), `test:${vendor}`, vendor);

  const removeKey = (vendor: ByomVendor) =>
    call(`/api/byom/keys?vendor=${vendor}`, { method: "DELETE" }, `del:${vendor}`);

  const setActive = (vendor: ByomVendor | null) =>
    call("/api/byom", { ...json({ activeVendor: vendor }), method: "PATCH" }, `active:${vendor ?? "off"}`);

  function saveModels(vendor: ByomVendor) {
    const md = modelDraft[vendor] ?? { model: "", fastModel: "" };
    return call(
      "/api/byom",
      {
        ...json({ models: { vendor, model: md.model.trim() || null, fastModel: md.fastModel.trim() || null } }),
        method: "PATCH",
      },
      `models:${vendor}`
    );
  }

  return (
    <section className="mt-8 max-w-2xl">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-navy-800">{t("title")}</h3>
        <p className="mt-0.5 text-sm text-muted">{t("subtitle")}</p>
      </div>

      {status === "error" ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-6">
          <p className="text-sm text-negative" role="alert">{t("loadError")}</p>
          <button type="button" onClick={retry} className={btnGhost}>
            {t("retry")}
          </button>
        </div>
      ) : !state ? (
        <div className="card p-6" aria-busy="true">
          <div className="h-4 w-40 animate-pulse rounded bg-navy-100" />
          <div className="mt-3 h-3 w-full animate-pulse rounded bg-navy-100" />
          <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-navy-100" />
        </div>
      ) : !state.entitled ? (
        <div className="card p-6">
          <h4 className="text-sm font-semibold text-navy-800">{t("upsellTitle")}</h4>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{t("upsellBody")}</p>
          <Link href="/cena" className={`mt-4 inline-block ${btnPrimary}`}>
            {t("upsellCta")}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <p className="rounded-lg bg-negative-soft px-3.5 py-2.5 text-sm text-negative" role="alert">
              {error}
            </p>
          )}

          {/* Turn BYOM off entirely (fall back to the app's provider). */}
          {state.config.activeVendor && (
            <button
              type="button"
              onClick={() => setActive(null)}
              disabled={busy !== null}
              className={`${btnGhost} w-full sm:w-auto`}
            >
              {t("useApp")}
            </button>
          )}

          {BYOM_VENDORS.map((vendor) => {
            const key = state.config.keys.find((k) => k.vendor === vendor);
            const isActive = state.config.activeVendor === vendor;
            const md = modelDraft[vendor] ?? { model: "", fastModel: "" };
            const vNotice = notice?.vendor === vendor ? notice : null;
            // A validation stamp older than the staleness window is no longer a live
            // verdict — say so instead of showing the same green "Verified" a probe
            // two minutes ago would earn.
            const stale = isByomValidationStale(key?.lastValidatedAt);

            return (
              <div key={vendor} className={`card p-5 ${isActive ? "ring-2 ring-brand-300" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold text-navy-800">{BYOM_VENDOR_LABELS[vendor]}</span>
                    {key ? (
                      isActive ? (
                        <Pill tone="brand">{t("active")}</Pill>
                      ) : key.lastValidatedAt ? (
                        <Pill tone={stale ? "coral" : "positive"}>
                          {stale ? t("validatedStale") : t("validated")}
                        </Pill>
                      ) : (
                        <Pill tone="neutral">{t("connected")}</Pill>
                      )
                    ) : (
                      <Pill tone="neutral">{t("notConnected")}</Pill>
                    )}
                  </div>
                  {key && !isActive && (
                    <button
                      type="button"
                      onClick={() => setActive(vendor)}
                      disabled={busy !== null}
                      className={btnGhost}
                    >
                      {t("setActive")}
                    </button>
                  )}
                  {isActive && <Check width={18} height={18} className="text-brand-accent" />}
                </div>

                {/* Which key is this, and how old is the verdict on it? Both are
                    metadata the server already holds — the fingerprint is stored at
                    encrypt time, never derived by decrypting on read. */}
                {key && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    {key.keyLast4 ? (
                      <span title={t("fingerprintTitle")} className="font-mono tracking-tight">
                        {t("fingerprint", { last4: key.keyLast4 })}
                      </span>
                    ) : (
                      <span title={t("fingerprintUnknownTitle")} className="italic">
                        {t("fingerprintUnknown")}
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    {key.lastValidatedAt ? (
                      <span className={stale ? TONE_TEXT.coral : undefined}>
                        {t("validatedAgo", { ago: fmt.fmtRelative(key.lastValidatedAt) })}
                      </span>
                    ) : (
                      <span>{t("validatedNever")}</span>
                    )}
                  </p>
                )}

                {/* No key yet, or replacing one → the key input. */}
                {(!key || showKeyInput[vendor]) && (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="password"
                      autoComplete="off"
                      value={keyDraft[vendor] ?? ""}
                      onChange={(e) => setKeyDraft((d) => ({ ...d, [vendor]: e.target.value }))}
                      placeholder={t("keyPlaceholder")}
                      aria-label={`${BYOM_VENDOR_LABELS[vendor]} ${t("keyLabel")}`}
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => saveKey(vendor)}
                      disabled={busy !== null || !(keyDraft[vendor] ?? "").trim()}
                      className={btnPrimary}
                    >
                      {busy === `save:${vendor}` ? t("saving") : key ? t("saveKey") : t("connect")}
                    </button>
                    {key && (
                      <button
                        type="button"
                        onClick={() => setShowKeyInput((s) => ({ ...s, [vendor]: false }))}
                        className={btnGhost}
                      >
                        {t("cancel")}
                      </button>
                    )}
                  </div>
                )}

                {/* Existing key → model choice + actions. */}
                {key && (
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-medium text-muted">{t("modelQuality")}</span>
                        <input
                          value={md.model}
                          onChange={(e) =>
                            setModelDraft((d) => ({ ...d, [vendor]: { ...md, model: e.target.value } }))
                          }
                          placeholder={MODEL_HINTS[vendor].quality}
                          className={`mt-1 ${inputClass}`}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-muted">{t("modelFast")}</span>
                        <input
                          value={md.fastModel}
                          onChange={(e) =>
                            setModelDraft((d) => ({ ...d, [vendor]: { ...md, fastModel: e.target.value } }))
                          }
                          placeholder={MODEL_HINTS[vendor].fast}
                          className={`mt-1 ${inputClass}`}
                        />
                      </label>
                    </div>

                    {vNotice && (
                      <p
                        className={`text-sm ${vNotice.ok ? "text-positive" : "text-negative"}`}
                        role="status"
                      >
                        {vNotice.text}
                      </p>
                    )}
                    {!vNotice && key.lastError && (
                      <p className="text-sm text-negative">{key.lastError}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => saveModels(vendor)}
                        disabled={busy !== null}
                        className={btnGhost}
                      >
                        {busy === `models:${vendor}` ? t("saving") : t("saveModels")}
                      </button>
                      <button
                        type="button"
                        onClick={() => testKey(vendor)}
                        disabled={busy !== null}
                        className={btnGhost}
                      >
                        {busy === `test:${vendor}` ? t("testing") : t("test")}
                      </button>
                      {!showKeyInput[vendor] && (
                        <button
                          type="button"
                          onClick={() => setShowKeyInput((s) => ({ ...s, [vendor]: true }))}
                          className={btnGhost}
                        >
                          {t("replaceKey")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeKey(vendor)}
                        disabled={busy !== null}
                        className="rounded-pill border border-negative/40 px-4 py-2 text-sm font-medium text-negative transition-colors hover:bg-negative-soft disabled:opacity-50"
                      >
                        {t("remove")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
