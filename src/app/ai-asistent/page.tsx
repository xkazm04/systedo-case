import type { Metadata } from "next";
import { Container, Eyebrow, Pill } from "@/components/ui";
import AiAssistant from "@/components/ai/AiAssistant";
import TaskPager from "@/components/site/TaskPager";
import { Bolt, Document, Info, Target } from "@/components/icons";

export const metadata: Metadata = {
  title: "AI asistent — marketingové nástroje na Claude a Gemini",
  description:
    "Tři AI nástroje pro marketing postavené na LLM wrapperu (claude-sonnet v devu, gemini-3-flash-preview v produkci): generátor PPC inzerátů, SEO obsahový brief a analýza výkonu klienta. Strukturovaný výstup a kontrola limitů.",
};

const APPROACH = [
  {
    icon: Document,
    title: "Strukturovaný výstup",
    body: "Model nevrací volný text, ale JSON podle schématu (responseSchema). Výsledek je rovnou typovaný a validovaný — žádné křehké parsování.",
  },
  {
    icon: Target,
    title: "Doménová pravidla v promptu",
    body: "Do instrukcí jsou zapečené limity Google Ads i SEO (nadpisy 30/90 znaků, title 60, meta 155) a oborové zásady. UI je navíc kontroluje a barevně označí přetečení.",
  },
  {
    icon: Bolt,
    title: "Klíč zůstává na serveru",
    body: "Volání běží v Route Handleru na Node runtime. GEMINI_API_KEY se nikdy nedostane do prohlížeče — klient vidí jen hotový výsledek.",
  },
  {
    icon: Info,
    title: "Funguje i bez klíče",
    body: "Bez API klíče se vrátí deterministická ukázka v limitech, jasně označená. Stránka je tak plně použitelná rovnou z repozitáře.",
  },
];

export default function AiAssistantPage() {
  return (
    <Container className="py-10 sm:py-12">
      {/* header */}
      <div className="border-b border-line pb-8">
        <Eyebrow>Úkol 3 · AI-asistovaný vývoj</Eyebrow>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
              AI marketingový asistent
            </h1>
            <p className="mt-2 max-w-2xl text-muted">
              Tři nástroje z každodenní práce agentury v jednom rozhraní — generování PPC inzerátů,
              SEO obsahový brief a analýza výkonu klienta. Každý odpovídá jednomu z pilířů Systedo a
              pohání je <strong className="text-navy-700">LLM wrapper</strong> (Claude Sonnet v devu,
              Gemini v produkci).
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
          <Eyebrow>Můj přístup k AI ve vývoji</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800">
            Jak je nástroj postavený
          </h2>
          <p className="mt-3 text-muted">
            LLM tu není kouzlo „napiš mi něco“, ale spolehlivý stavební prvek. Čtyři principy, které
            dělají rozdíl mezi demem a produkčním nasazením:
          </p>
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
          <span className="font-medium text-navy-700">Nastavení klíče:</span> zkopírujte{" "}
          <code className="rounded bg-navy-50 px-1.5 py-0.5 text-navy-700">.env.example</code> do{" "}
          <code className="rounded bg-navy-50 px-1.5 py-0.5 text-navy-700">.env.local</code> a doplňte{" "}
          <code className="rounded bg-navy-50 px-1.5 py-0.5 text-navy-700">GEMINI_API_KEY</code>. Klíč
          získáte zdarma v Google AI Studiu. Bez něj běží nástroj v ukázkovém režimu.
        </div>
      </section>

      <TaskPager current="/ai-asistent" />
    </Container>
  );
}
