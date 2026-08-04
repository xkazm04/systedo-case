import type { Metadata } from "next";
import { Container, Eyebrow, Pill } from "@/components/ui";
import AiAssistant from "@/components/ai/AiAssistant";
import TaskPager from "@/components/site/TaskPager";
import { Bolt, Document, Info, Target } from "@/components/icons";
import { getT } from "@/lib/i18n/server";

// generateMetadata is not wired here (this file has no server locale read for the
// metadata export) - the title/description below stay Czech-only per the
// contract's "flag, don't improvise" rule; see docs/i18n flags.
export const metadata: Metadata = {
  title: "AI asistent — marketingové nástroje na Claude a Gemini",
  description:
    "AI nástroje pro marketing postavené na LLM wrapperu (claude-sonnet v devu, gemini-3-flash-preview v produkci): generátor PPC inzerátů, výzkum klíčových slov, SEO obsahový brief a analýza výkonu klienta. Strukturovaný výstup a kontrola limitů.",
};

const T = {
  cs: {
    eyebrowTask: "Úkol 3 · AI-asistovaný vývoj",
    heading: "AI marketingový asistent",
    intro1:
      "Nástroje z každodenní práce agentury v jednom rozhraní — PPC inzeráty, výzkum klíčových slov, SEO brief, analýza výkonu a generování vizuálů (Leonardo + hodnocení Geminim). Výzkum předává klíčová slova rovnou do briefu a textové nástroje pohání",
    introStrong: "LLM wrapper",
    introEnd: "(Claude Sonnet v devu, Gemini v produkci).",
    approachEyebrow: "Můj přístup k AI ve vývoji",
    approachHeading: "Jak je nástroj postavený",
    approachIntro:
      "LLM tu není kouzlo „napiš mi něco“, ale spolehlivý stavební prvek. Čtyři principy, které dělají rozdíl mezi demem a produkčním nasazením:",
    approach1Title: "Strukturovaný výstup",
    approach1Body:
      "Model nevrací volný text, ale JSON podle schématu (responseSchema). Výsledek je rovnou typovaný a validovaný — žádné křehké parsování.",
    approach2Title: "Doménová pravidla v promptu",
    approach2Body:
      "Do instrukcí jsou zapečené limity Google Ads i SEO (nadpisy 30/90 znaků, title 60, meta 155) a oborové zásady. UI je navíc kontroluje a barevně označí přetečení.",
    approach3Title: "Klíč zůstává na serveru",
    approach3Body:
      "Volání běží v Route Handleru na Node runtime. GEMINI_API_KEY se nikdy nedostane do prohlížeče — klient vidí jen hotový výsledek.",
    approach4Title: "Funguje i bez klíče",
    approach4Body:
      "Bez API klíče se vrátí deterministická ukázka v limitech, jasně označená. Stránka je tak plně použitelná rovnou z repozitáře.",
    keySetup: "Nastavení klíče:",
    keySetupBody1: "zkopírujte",
    keySetupBody2: "do",
    keySetupBody3: "a doplňte",
    keySetupBody4: "Klíč získáte zdarma v Google AI Studiu. Bez něj běží nástroj v ukázkovém režimu.",
  },
  en: {
    eyebrowTask: "Task 3 · AI-assisted development",
    heading: "AI marketing assistant",
    intro1:
      "Tools from an agency's everyday work in one interface — PPC ads, keyword research, SEO briefs, performance analysis and visual generation (Leonardo + Gemini grading). Research hands its keywords straight into the brief, and the text tools run on an",
    introStrong: "LLM wrapper",
    introEnd: "(Claude Sonnet in dev, Gemini in production).",
    approachEyebrow: "My approach to AI in development",
    approachHeading: "How the tool is built",
    approachIntro:
      "The LLM here isn't a magic write-me-something trick, but a reliable building block. Four principles that make the difference between a demo and a production deployment:",
    approach1Title: "Structured output",
    approach1Body:
      "The model doesn't return free text — it returns JSON against a schema (responseSchema). The result is typed and validated on arrival, no brittle parsing.",
    approach2Title: "Domain rules baked into the prompt",
    approach2Body:
      "Google Ads and SEO limits (30/90-character headlines, 60-character title, 155-character meta) and industry conventions are baked into the instructions. The UI additionally checks and color-flags any overflow.",
    approach3Title: "The key stays on the server",
    approach3Body:
      "Calls run in a Route Handler on the Node runtime. GEMINI_API_KEY never reaches the browser — the client only sees the finished result.",
    approach4Title: "Works without a key",
    approach4Body:
      "Without an API key it returns a deterministic sample within the limits, clearly labelled. The page is fully usable straight out of the repository.",
    keySetup: "Key setup:",
    keySetupBody1: "copy",
    keySetupBody2: "to",
    keySetupBody3: "and fill in",
    keySetupBody4: "Get a free key from Google AI Studio. Without it, the tool runs in demo mode.",
  },
} as const;

export default async function AiAssistantPage() {
  const t = await getT(T);

  const APPROACH = [
    { icon: Document, title: t("approach1Title"), body: t("approach1Body") },
    { icon: Target, title: t("approach2Title"), body: t("approach2Body") },
    { icon: Bolt, title: t("approach3Title"), body: t("approach3Body") },
    { icon: Info, title: t("approach4Title"), body: t("approach4Body") },
  ];

  return (
    <Container className="py-10 sm:py-12">
      {/* header */}
      <div className="border-b border-line pb-8">
        <Eyebrow>{t("eyebrowTask")}</Eyebrow>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
              {t("heading")}
            </h1>
            <p className="mt-2 max-w-2xl text-muted">
              {t("intro1")} <strong className="text-navy-700">{t("introStrong")}</strong>{" "}
              {t("introEnd")}
            </p>
          </div>
          <Pill tone="brand">claude-sonnet</Pill>
        </div>
      </div>

      {/* the tools */}
      <div className="mt-8">
        <AiAssistant />
      </div>

      {/* approach to AI-assisted development */}
      <section className="mt-16 border-t border-line pt-12">
        <div className="max-w-2xl">
          <Eyebrow>{t("approachEyebrow")}</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800">
            {t("approachHeading")}
          </h2>
          <p className="mt-3 text-muted">{t("approachIntro")}</p>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {APPROACH.map((a) => (
            <div key={a.title} className="card p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-accent">
                <a.icon width={20} height={20} />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-navy-800">{a.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{a.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-card border border-line bg-canvas p-5 text-sm text-muted">
          <span className="font-medium text-navy-700">{t("keySetup")}</span> {t("keySetupBody1")}{" "}
          <code className="rounded bg-navy-50 px-1.5 py-0.5 text-navy-700">.env.example</code>{" "}
          {t("keySetupBody2")}{" "}
          <code className="rounded bg-navy-50 px-1.5 py-0.5 text-navy-700">.env.local</code>{" "}
          {t("keySetupBody3")}{" "}
          <code className="rounded bg-navy-50 px-1.5 py-0.5 text-navy-700">GEMINI_API_KEY</code>. {t("keySetupBody4")}
        </div>
      </section>

      <TaskPager current="/ai-asistent" />
    </Container>
  );
}
