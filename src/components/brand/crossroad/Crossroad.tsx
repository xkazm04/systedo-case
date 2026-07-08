/** Homepage crossroad — the four case-study destinations that used to live in
 *  the header nav, surfaced as a numbered launch directory. One light card, one
 *  row per stop (index · illustrated facet chip · title · blurb · arrow) — dense,
 *  editorial and scannable, like a table of contents for the case study.
 *
 *  Client component: it renders per-item icons + Leonardo illustrations resolved
 *  from CROSSROAD_META by href (the localized nav items arrive as serializable
 *  props from the server BrandLanding). */
"use client";

import Image from "next/image";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import { CROSSROAD_META, type CrossroadItem } from "./meta";

const T = {
  cs: {
    eyebrow: "Pracovní prostor",
    heading: "Vyberte si cíl",
    note: "Případová studie ve čtyřech zastávkách — každá je reálná část produktu, opřená o stejná klientská data.",
  },
  en: {
    eyebrow: "The workspace",
    heading: "Pick a destination",
    note: "The case study in four stops — each a real product surface, grounded in the same client data.",
  },
} as const;

export default function Crossroad({ items }: { items: CrossroadItem[] }) {
  const t = useT(T);
  return (
    <Container className="py-16 sm:py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
            {t("heading")}
          </h2>
        </div>
        <p className="max-w-md text-sm text-muted">
          {t("note")}
        </p>
      </div>

      <div className="mt-9 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {items.map((item, i) => {
          const meta = CROSSROAD_META[item.href];
          if (!meta) return null;
          const Icon = meta.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-4 border-b border-line p-4 transition-colors last:border-b-0 hover:bg-brand-50/50 sm:gap-6 sm:p-5"
            >
              <span className="hidden shrink-0 text-sm font-semibold tabular-nums text-muted sm:block">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-onyx text-brand-300 ring-1 ring-onyx-line">
                <Image src={meta.image} alt="" fill sizes="48px" className="object-cover opacity-70" />
                <Icon width={20} height={20} className="relative" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-navy-800">{item.label}</span>
                <span className="mt-0.5 block truncate text-sm text-muted">{item.blurb}</span>
              </span>
              <ArrowRight
                width={18}
                height={18}
                className="shrink-0 text-muted transition-[color,transform] group-hover:translate-x-1 group-hover:text-brand-accent"
              />
            </Link>
          );
        })}
      </div>
    </Container>
  );
}
