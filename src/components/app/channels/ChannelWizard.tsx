"use client";

/** Channel setup wizard — the "decide" step of the lifecycle. Walks one channel
 *  (or a queue of top-fit channels after an AI plan lands) through: interaction
 *  mode (manual/twin, kind-based recommendation preselected) → twin voice scope
 *  with live readiness hints → inbox source for conversational channels →
 *  cadence cap. Re-entry EDITS the stored track (prefilled, stage preserved) —
 *  it never resets a live channel back to "planned"; readiness gaps stay
 *  derived, so the finish CTA deep-links straight to the first blocker. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/app/Modal";
import { useProject } from "@/lib/projects/context";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import { ArrowRight, Check } from "@/components/icons";
import {
  channelKind,
  stageAfterDecision,
  type ChannelInboxSource,
  type ChannelMode,
  type ChannelTrack,
  type OrganicChannel,
} from "@/lib/organic-channels/types";
import {
  suggestedMode,
  suggestedTwinScope,
  type SignpostContext,
} from "@/lib/organic-channels/next-step";
import OptionCard from "./OptionCard";

const T = {
  cs: {
    title: "Nastavení kanálu",
    queueOf: "Kanál {i} z {n}",
    modeLead: "Kdo bude na kanálu komunikovat?",
    manual: "Ručně",
    manualHint: "Kroky děláte sami, modul je jen odškrtává a připomíná.",
    twin: "Dvojče",
    twinHint: "Trénované dvojče píše návrhy vaším hlasem, vy schvalujete.",
    recommended: "Doporučeno",
    scopeLead: "Jakým hlasem má dvojče mluvit?",
    scopeHint: "Hlas se trénuje v modulu Dvojče; každý kanál může mít vlastní tón.",
    voiceTrained: "Hlas je vytrénovaný",
    voiceMissing: "Hlas zatím není vytrénovaný — průvodce vás po uložení navede na trénink.",
    channelEnabled: "Kanál je v Nastavení kanálů zapnutý",
    channelDisabled: "Kanál je potřeba zapnout v Nastavení kanálů.",
    inboxLead: "Jak se reakce dostanou do Schránky?",
    inboxManual: "Ručně",
    inboxManualHint: "Reakce vkládáte do Schránky sami (kopírováním).",
    inboxImport: "Import",
    inboxImportHint: "Hromadný import reakcí (CSV / export z platformy).",
    inboxWatch: "Sledování",
    inboxWatchHint: "Automatické stahování reakcí připravujeme.",
    cadenceLead: "Kolik příspěvků týdně maximálně?",
    cadenceHint: "Pojistka proti spamování — víc jich modul nenavrhne.",
    perWeek: "{n}× týdně",
    back: "Zpět",
    next: "Pokračovat",
    skip: "Přeskočit",
    save: "Uložit plán",
    saveTrain: "Uložit a vytrénovat hlas",
  },
  en: {
    title: "Channel setup",
    queueOf: "Channel {i} of {n}",
    modeLead: "Who will do the talking on this channel?",
    manual: "Manually",
    manualHint: "You do the steps yourself; the module tracks and reminds.",
    twin: "Twin",
    twinHint: "Your trained twin drafts in your voice; you approve.",
    recommended: "Recommended",
    scopeLead: "Which voice should the twin use?",
    scopeHint: "Voices are trained in the Twin module; each channel can have its own tone.",
    voiceTrained: "Voice is trained",
    voiceMissing: "Voice isn't trained yet — the wizard will route you to training after saving.",
    channelEnabled: "Channel is enabled in Channel settings",
    channelDisabled: "The channel needs enabling in Channel settings.",
    inboxLead: "How do reactions reach the Inbox?",
    inboxManual: "Manually",
    inboxManualHint: "You paste reactions into the Inbox yourself.",
    inboxImport: "Import",
    inboxImportHint: "Bulk import of reactions (CSV / platform export).",
    inboxWatch: "Watch",
    inboxWatchHint: "Automatic reaction collection is coming.",
    cadenceLead: "How many posts per week at most?",
    cadenceHint: "The anti-spam cap — the module never suggests more.",
    perWeek: "{n}× a week",
    back: "Back",
    next: "Continue",
    skip: "Skip",
    save: "Save plan",
    saveTrain: "Save and train the voice",
  },
} as const;

const SCOPES = ["social", "email", "chat", "reviews"] as const;

const SCOPE_LABELS: Record<(typeof SCOPES)[number], { cs: string; en: string }> = {
  social: { cs: "Sociální sítě", en: "Social" },
  email: { cs: "E-mail", en: "Email" },
  chat: { cs: "Chat", en: "Chat" },
  reviews: { cs: "Recenze", en: "Reviews" },
};
const CADENCES = [1, 2, 3, 5, 7] as const;

type StepKey = "mode" | "scope" | "inbox" | "cadence";

/** Ordered steps for a channel given the (chosen or prefilled) mode. */
function stepsFor(channel: OrganicChannel, mode: ChannelMode): StepKey[] {
  return [
    "mode",
    ...(mode === "twin" ? (["scope"] as const) : []),
    ...(channelKind(channel.category) === "conversational" ? (["inbox"] as const) : []),
    "cadence",
  ];
}

export default function ChannelWizard({
  queue,
  tracks,
  ctx,
  open,
  startAt,
  onClose,
  onSave,
}: {
  /** channels to walk through (1 = row-triggered; N = post-AI-plan auto-offer) */
  queue: OrganicChannel[];
  /** stored lifecycle per channel — re-entry prefills from it and edits it */
  tracks: Record<string, ChannelTrack>;
  ctx: SignpostContext;
  open: boolean;
  /** land on a named step (the "set-inbox" CTA promises the inbox step) */
  startAt?: StepKey;
  onClose: () => void;
  /** persist the decision; the parent owns the tracks map + the POST */
  onSave: (channelId: string, track: ChannelTrack) => void;
}) {
  const t = useT(T);
  const router = useRouter();
  const project = useProject();
  const { locale } = useLocale();
  const L = locale === "en" ? "en" : "cs";

  /** Per-channel initial state: the stored track when re-entering ("Změnit
   *  nastavení" edits, it doesn't reset), else the kind-based defaults. */
  const initFor = (c: OrganicChannel | undefined) => {
    const tr = c ? tracks[c.id] : undefined;
    const mode0 = tr?.mode ?? null;
    // Land on the step the CTA named (when the channel's step list has it).
    const idx =
      c && startAt ? stepsFor(c, mode0 ?? suggestedMode(c)).indexOf(startAt) : -1;
    return {
      step: idx >= 0 ? idx : 0,
      mode: mode0,
      scope: tr?.twinScope ?? null,
      inbox: tr?.inboxSource ?? ("manual" as ChannelInboxSource),
      cadence: tr?.maxPerWeek ?? 3,
    };
  };

  const [qi, setQi] = useState(0);
  const channel = queue[Math.min(qi, queue.length - 1)];
  const [step, setStep] = useState(() => initFor(queue[0]).step);
  const [mode, setMode] = useState<ChannelMode | null>(() => initFor(queue[0]).mode);
  const [scope, setScope] = useState<string | null>(() => initFor(queue[0]).scope);
  const [inbox, setInbox] = useState<ChannelInboxSource>(() => initFor(queue[0]).inbox);
  const [cadence, setCadence] = useState<number>(() => initFor(queue[0]).cadence);

  if (!channel) return null;
  const kind = channelKind(channel.category);
  const chosenMode = mode ?? suggestedMode(channel);
  const chosenScope = scope ?? suggestedTwinScope(channel);
  const voiceTrained = ctx.trainedScopes.includes(chosenScope);
  const channelEnabled = ctx.enabledTwinChannels.includes(chosenScope);

  const steps = stepsFor(channel, chosenMode);
  const stepKey = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;
  const lastInQueue = qi + 1 >= queue.length;

  const reset = (c: OrganicChannel | undefined) => {
    const init = initFor(c);
    setStep(init.step);
    setMode(init.mode);
    setScope(init.scope);
    setInbox(init.inbox);
    setCadence(init.cadence);
  };

  const advanceQueue = () => {
    if (!lastInQueue) {
      setQi(qi + 1);
      reset(queue[qi + 1]);
    } else {
      onClose();
      setQi(0);
      reset(queue[0]);
    }
  };

  const finish = () => {
    const track: ChannelTrack = {
      // Editing settings never resets the lifecycle: live stays live, done stays
      // done (rule + rationale pinned at stageAfterDecision).
      stage: stageAfterDecision(tracks[channel.id]),
      mode: chosenMode,
      maxPerWeek: cadence,
      decidedAt: new Date().toISOString(),
      ...(chosenMode === "twin" ? { twinScope: chosenScope } : {}),
      ...(kind === "conversational" ? { inboxSource: inbox } : {}),
    };
    onSave(channel.id, track);
    // The training detour must not abandon the queue ("Kanál 1 z 3"): mid-queue
    // we advance to the next channel — the saved row's derived next step already
    // reads "Vytrénovat hlas", one click away — and only the LAST channel routes
    // straight to training (nothing left to abandon).
    if (chosenMode === "twin" && !voiceTrained && lastInQueue) {
      advanceQueue();
      router.push(`/app/${project.id}/twin?from=kanaly`);
      return;
    }
    advanceQueue();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={channel.name}
      description={
        queue.length > 1 ? t("queueOf", { i: Math.min(qi + 1, queue.length), n: queue.length }) : t("title")
      }
      size="md"
    >
      <div key={`${channel.id}-${stepKey}`} className="animate-fade-in space-y-4">
        {stepKey === "mode" && (
          <>
            <p className="text-sm font-semibold text-navy-800">{t("modeLead")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <OptionCard
                selected={chosenMode === "manual"}
                onSelect={() => setMode("manual")}
                label={t("manual")}
                hint={t("manualHint")}
                badge={suggestedMode(channel) === "manual" ? t("recommended") : undefined}
              />
              <OptionCard
                selected={chosenMode === "twin"}
                onSelect={() => setMode("twin")}
                label={t("twin")}
                hint={t("twinHint")}
                badge={suggestedMode(channel) === "twin" ? t("recommended") : undefined}
              />
            </div>
          </>
        )}

        {stepKey === "scope" && (
          <>
            <p className="text-sm font-semibold text-navy-800">{t("scopeLead")}</p>
            <div className="flex flex-wrap gap-2">
              {SCOPES.map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setScope(sc)}
                  aria-pressed={chosenScope === sc}
                  className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    chosenScope === sc
                      ? "border-brand-400 bg-brand-50 text-brand-800"
                      : "border-line text-muted hover:border-navy-200"
                  }`}
                >
                  {SCOPE_LABELS[sc][L]}
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted">{t("scopeHint")}</p>
            <ul className="space-y-1.5 rounded-card border border-line bg-canvas px-4 py-3 text-xs leading-relaxed">
              <li className={voiceTrained ? "text-positive" : "text-coral-600"}>
                {voiceTrained ? <Check width={12} height={12} className="mr-1 inline" /> : "· "}
                {voiceTrained ? t("voiceTrained") : t("voiceMissing")}
              </li>
              <li className={channelEnabled ? "text-positive" : "text-muted"}>
                {channelEnabled ? <Check width={12} height={12} className="mr-1 inline" /> : "· "}
                {channelEnabled ? t("channelEnabled") : t("channelDisabled")}
              </li>
            </ul>
          </>
        )}

        {stepKey === "inbox" && (
          <>
            <p className="text-sm font-semibold text-navy-800">{t("inboxLead")}</p>
            <div className="flex flex-col gap-2">
              <OptionCard
                selected={inbox === "manual"}
                onSelect={() => setInbox("manual")}
                label={t("inboxManual")}
                hint={t("inboxManualHint")}
              />
              <OptionCard
                selected={inbox === "import"}
                onSelect={() => setInbox("import")}
                label={t("inboxImport")}
                hint={t("inboxImportHint")}
              />
              <OptionCard
                selected={false}
                onSelect={() => {}}
                label={t("inboxWatch")}
                hint={t("inboxWatchHint")}
                disabled
              />
            </div>
          </>
        )}

        {stepKey === "cadence" && (
          <>
            <p className="text-sm font-semibold text-navy-800">{t("cadenceLead")}</p>
            <div className="flex flex-wrap gap-2">
              {CADENCES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCadence(n)}
                  aria-pressed={cadence === n}
                  className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    cadence === n
                      ? "border-brand-400 bg-brand-50 text-brand-800"
                      : "border-line text-muted hover:border-navy-200"
                  }`}
                >
                  {t("perWeek", { n })}
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted">{t("cadenceHint")}</p>
          </>
        )}

        <div className="flex items-center justify-between border-t border-line pt-4">
          <button
            type="button"
            onClick={() => (step > 0 ? setStep(step - 1) : advanceQueue())}
            className="text-xs font-medium text-muted transition-colors hover:text-navy-800"
          >
            {step > 0 ? t("back") : t("skip")}
          </button>
          <button
            type="button"
            onClick={() => (last ? finish() : setStep(step + 1))}
            className="inline-flex items-center gap-1.5 rounded-pill bg-brand-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-800"
          >
            {/* "and train" is only promised where finish() actually routes there
                (the last queue entry) — mid-queue the next channel comes first. */}
            {last
              ? chosenMode === "twin" && !voiceTrained && lastInQueue
                ? t("saveTrain")
                : t("save")
              : t("next")}
            <ArrowRight width={13} height={13} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
