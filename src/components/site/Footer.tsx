import Link from "next/link";
import { NAV_ITEMS } from "@/lib/nav";
import { External, Logo } from "@/components/icons";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-navy-800 text-navy-100">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-navy-700 text-brand-400">
              <Logo width={20} height={20} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-white">Systedo</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-navy-200">
            Ukázková případová studie pro pozici <strong className="text-white">AI Vibecoder</strong>.
            Tři úkoly, tři stránky, jeden konzistentní příběh klienta. Data jsou ilustrativní.
          </p>
          <p className="mt-4 text-sm text-navy-300">
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
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-navy-300">
            Stránky
          </h2>
          <ul className="mt-4 space-y-2.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-sm text-navy-100 transition-colors hover:text-brand-300"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-navy-300">
            O projektu
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm text-navy-200">
            <li>Next.js 16 · App Router</li>
            <li>JSON persistence (bez DB)</li>
            <li>Gemini · gemini-3-flash-preview</li>
            <li>Nasaditelné na Vercel</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-navy-700">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-navy-300 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} — případová studie, nikoli oficiální web Systedo.</span>
          <span>Vytvořeno s důrazem na UX, datovou konzistenci a čistý kód.</span>
        </div>
      </div>
    </footer>
  );
}
