import Link from "next/link";
import { NAV_ITEMS } from "@/lib/nav";
import { STACK_FACTS } from "@/lib/site";
import { External, Logo } from "@/components/icons";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-onyx text-onyx-ink">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-onyx-soft text-brand-400">
              <Logo width={20} height={20} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-white">Systedo</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-onyx-muted">
            Ukázková případová studie pro pozici <strong className="text-white">AI Vibecoder</strong>.
            Tři úkoly, tři stránky, jeden konzistentní příběh klienta. Data jsou ilustrativní.
          </p>
          <p className="mt-4 text-sm text-onyx-muted">
            Inspirováno přístupem{" "}
            <a
              href="https://www.systedo.cz/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand-300 hover:text-brand-200"
            >
              systedo.cz
              <External width={13} height={13} />
            </a>{" "}
            — „Pojďme růst společně.“
          </p>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-onyx-muted">
            Stránky
          </h2>
          <ul className="mt-4 space-y-2.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-sm text-onyx-ink transition-colors hover:text-brand-300"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-onyx-muted">
            O projektu
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm text-onyx-muted">
            {STACK_FACTS.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-onyx-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-onyx-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} — případová studie, nikoli oficiální web Systedo.</span>
          <span className="flex items-center gap-3">
            <Link href="/cena" className="font-medium text-onyx-muted transition-colors hover:text-brand-300">
              Ceník
            </Link>
            <span aria-hidden className="text-onyx-line">·</span>
            <Link href="/socialni" className="font-medium text-onyx-muted transition-colors hover:text-brand-300">
              Sociální sítě
            </Link>
            <span aria-hidden className="text-onyx-line">·</span>
            <Link href="/knihovna" className="font-medium text-onyx-muted transition-colors hover:text-brand-300">
              Knihovna vzorů
            </Link>
            <span aria-hidden className="text-onyx-line">·</span>
            <Link href="/mapa" className="font-medium text-onyx-muted transition-colors hover:text-brand-300">
              Mapa
            </Link>
            <span aria-hidden className="text-onyx-line">·</span>
            <Link href="/design-system" className="font-medium text-onyx-muted transition-colors hover:text-brand-300">
              Design system
            </Link>
            <span aria-hidden className="text-onyx-line">·</span>
            <span>Vytvořeno s důrazem na UX, datovou konzistenci a čistý kód.</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
