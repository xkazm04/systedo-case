"use client";

/** Katalog — the OUTBOUND PRODUCT FEED card (WP W2-D). Mints, shows and revokes the
 *  project's public feed address, and hands the merchant three ready-to-paste URLs —
 *  one per channel — so the catalog becomes the bid surface inside Merchant Center,
 *  Heureka and Zboží.cz instead of a screen only this app can read.
 *
 *  Unlike the webhook card this one shows the address EVERY time: a feed token is a
 *  capability URL the owner has to re-read and re-paste, not a secret shown once. The
 *  re-mint warning is therefore about breakage, not about leaking — the old URL stops
 *  working the moment a new one exists. */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { FEED_OUT_FORMATS, type FeedOutFormat } from "@/lib/catalog/feed-out";

const T = {
  cs: {
    title: "Produktový feed pro kanály",
    lead: "Katalog jako feed, který si Google, Heureka i Zboží.cz stáhnou samy — včetně štítků marže a skladu, takže se dá přihazovat na zisk, ne na odhad.",
    hintGoogle: "Merchant Center → Feedy → Naplánované načítání",
    hintHeureka: "Heureka → Nastavení → XML feed",
    hintZbozi: "Zboží.cz → Provozovny → Zdroj dat",
    mint: "Zveřejnit feed",
    minting: "Zveřejňuji…",
    remint: "Obnovit adresu",
    revoke: "Zrušit feed",
    copy: "Kopírovat",
    copied: "Zkopírováno",
    created: "Adresa vytvořena {date}.",
    empty: "Feed zatím není zveřejněný. Adresu vytvoříme až na klik — do té doby katalog ven nikam nevede.",
    warn: "Feed obsahuje jen aktivní produkty. Adresa je jediné heslo — kdo ji má, vidí katalog; obnovením ji okamžitě zneplatníte a musíte ji ve všech kanálech přepsat.",
    labels: "Štítky: custom_label_0 = pásmo marže, custom_label_1 = stav skladu.",
    loading: "Načítám nastavení feedu…",
    failed: "Nastavení feedu se nepodařilo načíst.",
    retry: "Zkusit znovu",
  },
  en: {
    title: "Product feed for the channels",
    lead: "Your catalog as a feed Google, Heureka and Zboží.cz pull for themselves — margin and stock labels included, so you can bid on profit instead of on a guess.",
    hintGoogle: "Merchant Center → Feeds → Scheduled fetch",
    hintHeureka: "Heureka → Settings → XML feed",
    hintZbozi: "Zboží.cz → Shops → Data source",
    mint: "Publish the feed",
    minting: "Publishing…",
    remint: "Rotate the URL",
    revoke: "Unpublish",
    copy: "Copy",
    copied: "Copied",
    created: "Address created {date}.",
    empty: "The feed isn't published yet. We only mint an address on click — until then nothing leads out of the catalog.",
    warn: "The feed carries live products only. The URL is the whole credential — anyone holding it sees the catalog; rotating it invalidates the old one at once and you must replace it in every channel.",
    labels: "Labels: custom_label_0 = margin band, custom_label_1 = stock status.",
    loading: "Loading the feed settings…",
    failed: "The feed settings could not be loaded.",
    retry: "Try again",
  },
} as const;

interface TokenShape {
  token: string;
  createdAt: string;
}

/** Per-channel display name + the "kam to vložit" hint key. Keyed by format so the row
 *  order stays FEED_OUT_FORMATS' — one list of channels, not two that can drift. */
const CHANNEL: Record<FeedOutFormat, { name: string; hint: "hintGoogle" | "hintHeureka" | "hintZbozi" }> = {
  google: { name: "Google Merchant", hint: "hintGoogle" },
  heureka: { name: "Heureka.cz", hint: "hintHeureka" },
  zbozi: { name: "Zboží.cz", hint: "hintZbozi" },
};

export default function FeedOutPanel({ projectId }: { projectId: string }) {
  const t = useT(T);
  const [token, setToken] = useState<TokenShape | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [busy, setBusy] = useState<"mint" | "revoke" | null>(null);
  const [copied, setCopied] = useState<FeedOutFormat | null>(null);
  const [reload, setReload] = useState(0);

  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/feed-token`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(endpoint);
        const json = (await res.json()) as { ok?: boolean; token?: TokenShape | null };
        if (cancelled) return;
        if (!json.ok) {
          setState("failed");
          return;
        }
        setToken(json.token ?? null);
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, reload]);

  const retry = () => {
    setState("loading");
    setReload((r) => r + 1);
  };

  const call = async (method: "POST" | "DELETE", which: "mint" | "revoke") => {
    setBusy(which);
    try {
      const res = await fetch(endpoint, { method });
      const json = (await res.json()) as { ok?: boolean; token?: TokenShape | null };
      if (json.ok) setToken(json.token ?? null);
      else setState("failed");
    } catch {
      setState("failed");
    } finally {
      setBusy(null);
    }
  };

  // Absolute so the string pastes straight into a channel's fetch settings; built in
  // the browser because only the browser knows which host this project is served from.
  const urlFor = (format: FeedOutFormat) =>
    token ? `${window.location.origin}/api/feed/${token.token}?format=${format}` : "";

  const copy = (format: FeedOutFormat) => {
    void navigator.clipboard?.writeText(urlFor(format));
    setCopied(format);
  };

  return (
    <section className="stagger mt-10 max-w-3xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">{t("title")}</h2>
        <p className="mt-0.5 text-sm text-muted">{t("lead")}</p>
      </div>

      <div className="card space-y-4 p-6">
        {state === "loading" && <p className="text-sm text-muted">{t("loading")}</p>}

        {state === "failed" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-negative" role="alert">{t("failed")}</p>
            <Button variant="secondary" size="sm" onClick={retry}>{t("retry")}</Button>
          </div>
        )}

        {state === "ready" && token === null && <p className="text-sm text-muted">{t("empty")}</p>}

        {state === "ready" && token !== null && (
          <>
            <ul className="space-y-3">
              {FEED_OUT_FORMATS.map((format) => (
                <li key={format} className="rounded-lg border border-line p-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{CHANNEL[format].name}</span>
                    <span className="text-xs text-muted">{t(CHANNEL[format].hint)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md bg-brand-50 px-2.5 py-1.5 font-mono text-xs text-ink">
                      {urlFor(format)}
                    </code>
                    <Button variant="ghost" size="sm" onClick={() => copy(format)}>
                      {copied === format ? t("copied") : t("copy")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">{t("labels")}</p>
            <p className="text-xs text-muted">
              {t("created", { date: new Date(token.createdAt).toLocaleDateString() })}
            </p>
          </>
        )}

        {state === "ready" && (
          <>
            <p className="rounded-lg bg-brand-50 px-3.5 py-2.5 text-xs text-muted">{t("warn")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" disabled={busy !== null} onClick={() => void call("POST", "mint")}>
                {busy === "mint" ? t("minting") : token ? t("remint") : t("mint")}
              </Button>
              {token && (
                <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void call("DELETE", "revoke")}>
                  {t("revoke")}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
